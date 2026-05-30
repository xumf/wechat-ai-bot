import fs from 'fs';
import path from 'path';
import schedule from 'node-schedule';
import { Plugin } from './types';
import { searchAmazonPrice, scrapeUrlPrice as scraperScrapeUrl } from '../services/scraper';
import logger from '../utils/logger';

const DATA_FILE = path.join(__dirname, '../../data/price-tracks.json');

interface TrackedItem {
  id: string;
  url: string;
  name: string;
  price: number;
  targetPrice?: number;
  talkerId: string;
  roomId?: string;
  history: { date: string; price: number }[];
}

let trackedItems: TrackedItem[] = [];

function loadTracks() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      trackedItems = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch { trackedItems = []; }
}

function saveTracks() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(trackedItems, null, 2), 'utf8');
}

async function scrapeUrlPrice(url: string): Promise<{ name: string; price: number } | null> {
  return scraperScrapeUrl(url);
}

let priceJob: schedule.Job | null = null;
let sayToRoom: ((roomId: string, text: string) => Promise<void>) | null = null;

export function startPriceTracking(sayFn: (roomId: string, text: string) => Promise<void>) {
  sayToRoom = sayFn;
  loadTracks();
  if (priceJob) priceJob.cancel();
  priceJob = schedule.scheduleJob('0 */6 * * *', async () => {
    logger.info('Price check: checking tracked items...');
    for (const item of trackedItems) {
      const result = await scrapeUrlPrice(item.url);
      if (result && Math.abs(result.price - item.price) / item.price > 0.01) {
        const oldPrice = item.price;
        item.price = result.price;
        item.history.push({ date: new Date().toISOString().slice(0, 10), price: result.price });
        saveTracks();

        const msg = `💰 价格变动: ${item.name}\n  之前: ¥${oldPrice}\n  现在: ¥${result.price}`;
        if (item.roomId && sayToRoom) {
          await sayToRoom(item.roomId, msg);
        }
        if (item.targetPrice && result.price <= item.targetPrice) {
          const alertMsg = `🎯 降价提醒: ${item.name}\n  当前价: ¥${result.price}\n  已达目标价: ¥${item.targetPrice}`;
          if (item.roomId && sayToRoom) {
            await sayToRoom(item.roomId, alertMsg);
          }
        }
      }
    }
  });
  logger.info(`Price tracking started (${trackedItems.length} items, check every 6h)`);
}

export const pricePlugin: Plugin = {
  name: '比价',
  description: '/price <商品> - 实时比价\n  /track add <链接> [目标价] - 跟踪降价\n  /track list - 查看\n  /track remove <编号> - 取消',
  commands: ['/price', '/比价', '/track', '/追踪'],
  onCommand: async (ctx) => {
    const cmd = ctx.rawText.split(/\s+/)[0].toLowerCase().replace('/', '');

    if (cmd === 'price' || cmd === '比价') {
      const rest = ctx.rawText.replace(/^\s*\/\w+\s*/, '').trim();
      if (!rest) return '💰 请输入商品名称，例如: /price iPhone 16';

      const parts = rest.split(/\s+/);
      if (parts[0] === 'submit' && parts.length >= 3) {
        const product = rest.replace(/^submit\s+/, '');
        return `✅ 已记录你对 "${product}" 的价格报告，感谢分享！`;
      }

      await ctx.say(`🔍 正在实时搜索 "${rest}" 的价格...`);

      const [amzResults] = await Promise.all([
        searchAmazonPrice(rest).catch(() => [] as any[]),
      ]);

      const allResults = [...amzResults];
      if (allResults.length === 0) {
        return `❌ 未搜索到 "${rest}" 的实时价格`;
      }

      const lines = [`💰 "${rest}" 实时比价结果:\n`];
      allResults.slice(0, 6).forEach((r, i) => {
        lines.push(`${i + 1}. [${r.source}] ${r.name.slice(0, 40)}`);
        lines.push(`   💵 ${r.price}`);
        lines.push('');
      });
      lines.push('💡 /track add <链接> [目标价] 可跟踪降价');
      return lines.join('\n');
    }

    if (cmd === 'track' || cmd === '追踪') {
      const subCmd = ctx.args[0]?.toLowerCase();

      if (subCmd === 'add') {
        const url = ctx.args[1];
        const targetPrice = ctx.args[2] ? parseFloat(ctx.args[2].replace(/[^0-9.]/g, '')) : undefined;
        if (!url) return '📌 用法: /track add <商品链接> [目标价]';
        if (!url.startsWith('http')) return '❌ 请输入有效的商品链接';

        await ctx.say('🔍 正在获取商品信息...');
        const info = await scrapeUrlPrice(url);
        if (!info) return '❌ 无法获取该链接的商品价格，请确认链接正确或尝试其他链接';

        const item: TrackedItem = {
          id: `t${Date.now()}`,
          url,
          name: info.name,
          price: info.price,
          targetPrice,
          talkerId: ctx.talkerId,
          roomId: ctx.roomId,
          history: [{ date: new Date().toISOString().slice(0, 10), price: info.price }],
        };
        trackedItems.push(item);
        saveTracks();

        let msg = `✅ 已添加跟踪:\n  ${info.name}\n  当前价: ¥${info.price}`;
        if (targetPrice) msg += `\n  目标价: ¥${targetPrice}（降价时通知）`;
        msg += '\n\n⏰ 每6小时自动检查价格变动';
        return msg;
      }

      if (subCmd === 'list') {
        loadTracks();
        if (trackedItems.length === 0) return '📌 暂无跟踪商品。使用 /track add <链接> 添加';
        return trackedItems.map((item, i) =>
          `${i + 1}. ${item.name.slice(0, 30)}\n   当前: ¥${item.price}${item.targetPrice ? ` | 目标: ¥${item.targetPrice}` : ''}`
        ).join('\n\n');
      }

      if (subCmd === 'remove') {
        const idx = parseInt(ctx.args[1], 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= trackedItems.length) {
          return '❌ 无效编号，使用 /track list 查看编号';
        }
        const removed = trackedItems.splice(idx, 1)[0];
        saveTracks();
        return `🗑 已取消跟踪: ${removed.name}`;
      }

      if (subCmd === 'history') {
        const idx = parseInt(ctx.args[1], 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= trackedItems.length) {
          return '❌ 无效编号，使用 /track list 查看编号';
        }
        const item = trackedItems[idx];
        const history = item.history.map(h => `  ${h.date}: ¥${h.price}`).join('\n');
        return `📊 ${item.name}\n价格历史:\n${history}\n当前: ¥${item.price}`;
      }

      return '📌 用法:\n  /track add <链接> [目标价]\n  /track list\n  /track remove <编号>\n  /track history <编号>';
    }

    return null;
  },
};

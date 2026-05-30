import Parser from 'rss-parser';
import schedule from 'node-schedule';
import fs from 'fs';
import path from 'path';
import { Plugin, CommandContext } from './types';
import logger from '../utils/logger';

const parser = new Parser();
const DATA_FILE = path.join(__dirname, '../../data/rss-subs.json');

interface Subscription {
  url: string;
  talkerId: string;
  roomId?: string;
  lastTitle?: string;
}

let subscriptions: Subscription[] = [];

function loadSubs() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      subscriptions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch { subscriptions = []; }
}

function saveSubs() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(subscriptions, null, 2), 'utf8');
}

async function checkRSS(say: (text: string) => Promise<void>) {
  for (const sub of subscriptions) {
    try {
      const feed = await parser.parseURL(sub.url);
      const latest = feed.items?.[0];
      if (latest && latest.title !== sub.lastTitle) {
        const msg = `📰 ${feed.title || 'RSS 更新'}\n${latest.title}\n${latest.link || ''}`;
        await say(msg);
        sub.lastTitle = latest.title;
        saveSubs();
      }
    } catch (e) {
      logger.error(`RSS check failed for ${sub.url}`, { error: e });
    }
  }
}

function sayForSub(sub: Subscription, botSay: (roomId: string, text: string) => Promise<void>) {
  return async (text: string) => {
    if (sub.roomId) {
      await botSay(sub.roomId, text);
    }
  };
}

let rssJob: schedule.Job | null = null;

export function startRSSPolling(sayToRoom: (roomId: string, text: string) => Promise<void>) {
  loadSubs();
  if (rssJob) rssJob.cancel();
  rssJob = schedule.scheduleJob('*/30 * * * *', async () => {
    for (const sub of subscriptions) {
      const say = sayForSub(sub, sayToRoom);
      await checkRSS(say);
    }
  });
  logger.info('RSS polling started (every 30 min)');
}

export const rssPlugin: Plugin = {
  name: 'RSS 订阅',
  description: '/rss add <url> - 订阅 RSS\n  /rss list - 查看订阅\n  /rss remove <编号> - 取消订阅',
  commands: ['/rss'],
  onCommand: async (ctx) => {
    loadSubs();
    const action = ctx.args[0]?.toLowerCase();

    if (action === 'add') {
      const url = ctx.args[1];
      if (!url) return '📰 用法: /rss add <RSS链接>';
      try {
        const feed = await parser.parseURL(url);
        subscriptions.push({
          url,
          talkerId: ctx.talkerId,
          roomId: ctx.roomId,
          lastTitle: feed.items?.[0]?.title,
        });
        saveSubs();
        return `✅ 已订阅: ${feed.title || url}\n每30分钟检查更新`;
      } catch {
        return '❌ 无法解析该 RSS 链接，请检查地址是否正确';
      }
    }

    if (action === 'list') {
      if (subscriptions.length === 0) return '📰 暂无订阅';
      return subscriptions.map((s, i) =>
        `${i + 1}. ${s.url.slice(0, 50)}...`
      ).join('\n');
    }

    if (action === 'remove') {
      const idx = parseInt(ctx.args[1], 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= subscriptions.length) {
        return '❌ 无效编号，使用 /rss list 查看编号';
      }
      const removed = subscriptions.splice(idx, 1)[0];
      saveSubs();
      return `🗑 已取消订阅: ${removed.url}`;
    }

    return '📰 用法:\n  /rss add <url> - 订阅\n  /rss list - 列表\n  /rss remove <编号> - 取消';
  },
};

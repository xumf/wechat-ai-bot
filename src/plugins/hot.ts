import { Plugin } from './types';
import { getBrowserContext } from '../services/scraper';
import logger from '../utils/logger';

interface PlatformConfig {
  url: string;
  extract: string;
}

const platforms: Record<string, PlatformConfig> = {
  weibo: {
    url: 'https://weibo.cn/pub/',
    extract: 'weibo',
  },
  zhihu: {
    url: 'https://www.zhihu.com/explore',
    extract: 'zhihu',
  },
  baidu: {
    url: 'https://top.baidu.com/board?tab=realtime',
    extract: 'baidu',
  },
};

const platformNames: Record<string, string> = {
  weibo: '微博', zhihu: '知乎', baidu: '百度',
};

async function scrapeWeibo(page: any): Promise<string[]> {
  await page.goto('https://weibo.cn/pub/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(3000);
  return page.evaluate(() => {
    const skip = ['登录', '注册', '触屏版', '客户端', '客服', '京ICP备12002058号'];
    return Array.from(document.querySelectorAll('a'))
      .map(a => a.textContent.trim())
      .filter(t => t && t.length > 1 && !skip.includes(t));
  });
}

async function scrapeZhihu(page: any): Promise<string[]> {
  await page.goto('https://www.zhihu.com/explore', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(5000);
  return page.evaluate(() => {
    const text = document.body.innerText;
    const lines: string[] = [];
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t && t.endsWith('？') && t.length > 5) lines.push(t);
    }
    return lines.slice(0, 15);
  });
}

async function scrapeBaidu(page: any): Promise<string[]> {
  await page.goto('https://top.baidu.com/board?tab=realtime', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(4000);
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.c-single-text-ellipsis'))
      .map(el => el.textContent.trim())
      .filter(Boolean);
  });
}

export const hotPlugin: Plugin = {
  name: '热搜',
  description: '/hot [平台] - 热搜榜\n  平台: weibo(默认), zhihu, baidu',
  commands: ['/hot', '/热搜'],
  onCommand: async (ctx) => {
    const platform = ctx.args[0]?.toLowerCase() || 'weibo';
    if (!platforms[platform]) return '❌ 支持: weibo(默认), zhihu, baidu';

    await ctx.say('🔍 正在获取热搜...');

    try {
      const bCtx = await getBrowserContext();
      const page = await bCtx.newPage();
      await page.setViewportSize({ width: 1920, height: 1080 });

      let results: string[] = [];
      if (platform === 'weibo') results = await scrapeWeibo(page);
      else if (platform === 'zhihu') results = await scrapeZhihu(page);
      else if (platform === 'baidu') results = await scrapeBaidu(page);

      await page.close();

      const seen = new Set<string>();
      const filtered = results.filter(t => {
        const clean = t.replace(/[\d.]+$/, '').trim();
        if (clean && clean.length > 2 && !seen.has(clean)) {
          seen.add(clean);
          return true;
        }
        return false;
      }).slice(0, 15);

      if (filtered.length === 0) return `❌ 暂时无法获取${platformNames[platform]}热搜`;

      const lines = [`🔥 ${platformNames[platform]}热搜:\n`];
      filtered.forEach((item, i) => {
        lines.push(`${i + 1}. ${item}`);
      });
      return lines.join('\n');
    } catch (e: any) {
      logger.error('Hot search error', { error: e.message });
      return `❌ 获取热搜失败: ${e.message}`;
    }
  },
};

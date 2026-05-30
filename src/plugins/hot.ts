import { Plugin } from './types';
import { getBrowserContext } from '../services/scraper';
import logger from '../utils/logger';

export const hotPlugin: Plugin = {
  name: '热搜',
  description: '/hot [平台] - 查看热搜\n  平台: weibo(默认), zhihu, baidu, douyin',
  commands: ['/hot', '/热搜'],
  onCommand: async (ctx) => {
    const platform = ctx.args[0]?.toLowerCase() || 'weibo';
    await ctx.say('🔍 正在获取热搜...');

    try {
      const bCtx = await getBrowserContext();
      const page = await bCtx.newPage();
      await page.setViewportSize({ width: 1920, height: 1080 });

      let results: string[] = [];

      if (platform === 'zhihu') {
        await page.goto('https://www.zhihu.com/hot', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3000);
        results = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.HotItem-title, [class*="HotItem"] h2, .TopstoryItem-title'))
            .slice(0, 15)
            .map(el => el.textContent?.trim() || '')
            .filter(Boolean);
        });
      } else if (platform === 'baidu') {
        await page.goto('https://top.baidu.com/board?tab=realtime', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(3000);
        results = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('.c-single-text-ellipsis, .title-title, [class*="title"] a'))
            .slice(0, 15)
            .map(el => el.textContent?.trim() || '')
            .filter(Boolean);
        });
      } else {
        await page.goto('https://weibo.com/ajax/side/hotSearch', { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(2000);
        const raw = await page.evaluate(() => {
          try {
            const text = document.querySelector('pre')?.textContent || document.body.innerText;
            const data = JSON.parse(text);
            return (data.data?.realtime || []).map((item: any) => item.word).filter(Boolean);
          } catch { return []; }
        });
        results = raw;
      }

      await page.close();

      if (results.length === 0) return `❌ 暂时无法获取${platform}热搜`;

      const platformName: Record<string, string> = { weibo: '微博', zhihu: '知乎', baidu: '百度' };
      const lines = [`🔥 ${platformName[platform] || platform}热搜:\n`];
      results.slice(0, 15).forEach((item, i) => {
        lines.push(`${i + 1}. ${item}`);
      });
      return lines.join('\n');
    } catch (e: any) {
      logger.error('Hot search error', { error: e.message });
      return `❌ 获取热搜失败: ${e.message}`;
    }
  },
};

import { Plugin } from './types';

export const weatherPlugin: Plugin = {
  name: '天气',
  description: '/weather <城市名> - 查询天气',
  commands: ['/weather', '/天气', '/tianqi'],
  onCommand: async (ctx) => {
    const city = ctx.args.join(' ');
    if (!city) {
      return '🌤 请告诉我城市名，例如: /weather 北京';
    }
    try {
      const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%C+%t+%h+%w&lang=zh`);
      if (!res.ok) return `❌ 找不到城市: ${city}`;
      const data = await res.text();
      const cleaned = data.replace(/\s+/g, ' ').trim();
      return `🌍 ${city} 天气: ${cleaned}`;
    } catch {
      return '❌ 天气服务暂时不可用';
    }
  },
};

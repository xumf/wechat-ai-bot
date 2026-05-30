import schedule from 'node-schedule';
import { Plugin } from './types';
import logger from '../utils/logger';

const jobs = new Map<string, schedule.Job>();

function parseTime(input: string): Date | null {
  const now = new Date();

  const inMatch = input.match(/^in\s+(\d+)\s*(秒|秒钟|分钟|小时|天)s?$/i);
  if (inMatch) {
    const num = parseInt(inMatch[1], 10);
    const unit = inMatch[2];
    const ms = unit.includes('秒') ? num * 1000
      : unit.includes('分') ? num * 60000
      : unit.includes('小') ? num * 3600000
      : unit.includes('天') ? num * 86400000
      : 0;
    return new Date(now.getTime() + ms);
  }

  const atMatch = input.match(/^(at)?\s*(\d{1,2}):(\d{2})\s*$/i);
  if (atMatch) {
    const h = parseInt(atMatch[2], 10);
    const m = parseInt(atMatch[3], 10);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }

  return null;
}

export const reminderPlugin: Plugin = {
  name: '提醒',
  description: '/remind <时间> <内容> - 设置定时提醒\n  例如: /remind in 5分钟 喝水\n  例如: /remind 14:30 开会',
  commands: ['/remind', '/提醒', '/定时'],
  onCommand: async (ctx) => {
    const text = ctx.args.join(' ');
    const match = text.match(/^(in\s+\d+\s*\S+|at\s*)?(.+)$/);
    if (!match) return '⏰ 用法: /remind in 5分钟 提醒内容 或 /remind 14:30 提醒内容';

    const timeStr = ctx.args[0]?.startsWith('in') || /^\d/.test(ctx.args[0] || '')
      ? ctx.args.slice(0, ctx.args[0]?.startsWith('in') ? 2 : 1).join(' ')
      : '';
    const msgStart = timeStr ? ctx.args.slice(timeStr.split(/\s+/).length).join(' ') : ctx.args.join(' ');

    if (!msgStart) return '⏰ 请告诉我提醒内容';

    const time = parseTime(timeStr || ctx.args[0]);
    if (!time) return '⏰ 时间格式错误。示例: /remind in 5分钟 喝水 或 /remind 14:30 开会';

    const jobId = `${ctx.talkerId}_${Date.now()}`;
    const job = schedule.scheduleJob(time, async () => {
      try {
        await ctx.say(`⏰ 提醒: ${msgStart}`);
        jobs.delete(jobId);
      } catch (e) {
        logger.error('Reminder send failed', { error: e });
      }
    });

    if (job) {
      jobs.set(jobId, job);
      return `✅ 已设置提醒，将在 ${time.toLocaleString('zh-CN')} 提醒你: ${msgStart}`;
    }
    return '❌ 设置提醒失败';
  },
};

import { Plugin } from './types';
import { clearSession } from '../utils/session';

export const clearPlugin: Plugin = {
  name: '清除记忆',
  description: '清除对话历史，重新开始',
  commands: ['/clear', '/重置', '/清空'],
  onCommand: async (ctx) => {
    clearSession(ctx.roomId || ctx.talkerId, ctx.roomId ? ctx.talkerId : undefined);
    return '🧹 对话已重置，我们可以重新开始啦！';
  },
};

import { Plugin } from './types';

const keywordReplies: [RegExp, string | (() => string)][] = [
  [/^(你好|嗨|hi|hello|hey)\s*$/i, '你好！我是AI助手，有什么可以帮你的吗？😊'],
  [/^(再见|拜拜|bye|88)\s*$/i, '再见！有需要随时找我哦 👋'],
  [/^(谢谢|感谢|多谢|thanks)\s*$/i, '不客气！很高兴能帮到你 😊'],
  [/^(你是谁|你叫什么|介绍)/, '我是AI助手，由 AI 驱动的微信机器人，可以陪你聊天、查询信息、设置提醒等！'],
  [/^(几点|时间|date|time)/, () => `🕐 现在是 ${new Date().toLocaleString('zh-CN')}`],
];

export const keywordPlugin: Plugin = {
  name: '关键词回复',
  description: '关键词自动回复',
  onMessage: async (text) => {
    for (const [pattern, reply] of keywordReplies) {
      if (pattern.test(text)) {
        return typeof reply === 'function' ? reply() : reply;
      }
    }
    return null;
  },
};

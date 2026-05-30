import { Plugin } from './types';
import { getAIResponseWithSystem } from '../services/openai';

export const jokePlugin: Plugin = {
  name: '讲笑话',
  description: '/joke [主题] - AI 讲个笑话\n  例: /joke 程序员',
  commands: ['/joke', '/笑话'],
  onCommand: async (ctx) => {
    const topic = ctx.rawText.replace(/^\s*\/\w+\s*/, '').trim();
    const prompt = topic
      ? `你是一个讲笑话大师。请讲一个关于"${topic}"的简短幽默笑话，控制在100字以内。`
      : `你是一个讲笑话大师。请讲一个简短幽默的笑话，控制在100字以内。`;
    const reply = await getAIResponseWithSystem('讲个笑话', prompt);
    return `😄 ${reply}`;
  },
};

import { Plugin } from './types';
import { getAIResponseWithSystem } from '../services/openai';

const langMap: Record<string, string> = {
  en: '英语', zh: '中文', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语',
  ar: '阿拉伯语', pt: '葡萄牙语', it: '意大利语',
};

export const translatePlugin: Plugin = {
  name: '翻译',
  description: '/translate <目标语言> <文本> - 翻译\n  /en <文本> - 译成英语\n  /zh <文本> - 译成中文\n  例: /zh Hello world',
  commands: ['/translate', '/en', '/zh', '/ja', '/fr', '/de', '/es', '/ru', '/ko'],
  onCommand: async (ctx) => {
    const cmd = ctx.rawText.split(/\s+/)[0].toLowerCase().replace('/', '');
    const input = ctx.rawText.replace(/^\s*\/\w+\s*/, '').trim();

    if (!input) return '🌐 请提供要翻译的文本。例如: /zh Hello world';

    if (cmd === 'translate') {
      const targetLang = ctx.args[0] || '';
      const text = ctx.args.slice(1).join(' ');
      if (!text) return '🌐 用法: /translate <语言> <文本>';
      const langName = langMap[targetLang] || targetLang;
      const reply = await getAIResponseWithSystem(
        text,
        `你是一个专业翻译。请将以下文本翻译成${langName}，只返回译文，不要解释。`
      );
      return `🌐 ${reply}`;
    }

    const langName = langMap[cmd] || cmd;
    const reply = await getAIResponseWithSystem(
      input,
      `你是一个专业翻译。请将以下文本翻译成${langName}，只返回译文，不要解释。`
    );
    return `🌐 ${reply}`;
  },
};

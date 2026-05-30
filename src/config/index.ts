import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  bot: {
    name: process.env.WECHAT_BOT_NAME || 'AI助手',
    autoAcceptFriend: process.env.WECHAT_AUTO_ACCEPT_FRIEND === 'true',
    autoReplyFriend: process.env.WECHAT_AUTO_REPLY_FRIEND || '你好，我是AI助手，很高兴认识你！',
    adminWechat: process.env.BOT_ADMIN_WECHAT || '',
    replyPrivate: process.env.BOT_REPLY_PRIVATE !== 'false',
    replyRoom: process.env.BOT_REPLY_ROOM === 'true',
    roomAtOnly: process.env.BOT_ROOM_AT_ONLY !== 'false',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1000', 10),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.7'),
    systemPrompt: process.env.OPENAI_SYSTEM_PROMPT || '你是一个友好的微信聊天助手，请用中文回复用户消息。回答简洁、准确、有帮助。',
  },
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required');
  }
  return errors;
}

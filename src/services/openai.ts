import OpenAI from 'openai';
import { config } from '../config';
import { getSessionMessages, appendMessage } from '../utils/session';
import logger from '../utils/logger';

const client = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseURL,
});

function buildMessages(sessionId: string, userId: string | undefined, userMessage: string) {
  const history = getSessionMessages(sessionId, userId);
  return [
    { role: 'system' as const, content: config.openai.systemPrompt },
    ...history,
    { role: 'user' as const, content: userMessage },
  ];
}

export async function getAIResponse(
  userMessage: string,
  sessionId: string,
  userId?: string,
): Promise<string> {
  try {
    appendMessage(sessionId, 'user', userMessage, userId);
    const messages = buildMessages(sessionId, userId, userMessage);

    const completion = await client.chat.completions.create({
      model: config.openai.model,
      messages,
      max_tokens: config.openai.maxTokens,
      temperature: config.openai.temperature,
    });

    const reply = completion.choices[0]?.message?.content || '抱歉，我现在无法回答。';
    appendMessage(sessionId, 'assistant', reply, userId);
    return reply;
  } catch (error: any) {
    logger.error('OpenAI API error', { error: error.message });
    if (error.status === 401) return 'API Key 无效，请检查配置。';
    if (error.status === 429) return '请求过于频繁，请稍后再试。';
    return 'AI 服务暂时不可用，请稍后重试。';
  }
}

export async function getAIResponseWithSystem(
  userMessage: string,
  systemPrompt: string,
): Promise<string> {
  try {
    const completion = await client.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: config.openai.maxTokens,
      temperature: config.openai.temperature,
    });
    return completion.choices[0]?.message?.content || '暂无回复。';
  } catch (error: any) {
    logger.error('OpenAI API error', { error: error.message });
    return 'AI 服务暂时不可用。';
  }
}

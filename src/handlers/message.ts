import { types } from 'wechaty';
import { config } from '../config';
import { getAIResponse } from '../services/openai';
import { handleCommand, handleKeyword } from '../plugins/registry';
import { CommandContext } from '../plugins/types';
import { searchAmazonPrice, searchTaobaoPrice, searchJdPrice } from '../services/scraper';
import logger from '../utils/logger';

type Message = any;

export async function onMessage(this: any, message: Message) {
  try {
    const talker = message.talker();
    const room = message.room();
    const text = message.text().trim();
    const isSelf = talker.self();

    if (isSelf || message.type() !== types.Message.Text || !text) return;

    if (room) {
      await handleRoomMessage(message, room, talker, text);
    } else {
      await handlePrivateMessage(message, talker, text);
    }
  } catch (error) {
    logger.error('Message handler error', { error });
  }
}

function buildContext(talker: any, room: any | null, say: (text: string) => Promise<void>): CommandContext {
  return {
    args: [],
    rawText: '',
    talkerId: talker.id,
    talkerName: talker.name(),
    roomId: room?.id,
    say,
  };
}

async function handlePrivateMessage(message: Message, talker: any, text: string) {
  if (!config.bot.replyPrivate) return;
  logger.info(`Private message from ${talker.name()}: ${text}`);

  const ctx = buildContext(talker, null, (t) => message.say(t));

  if (text.startsWith('/')) {
    const cmdReply = await handleCommand(text, ctx);
    if (cmdReply) { await message.say(cmdReply); return; }
  }

  const keywordReply = await handleKeyword(text, ctx);
  if (keywordReply) { await message.say(keywordReply); return; }

  const priceReply = await handlePriceQuery(text, ctx);
  if (priceReply) { await message.say(priceReply); return; }

  await message.say('正在思考...');
  const reply = await getAIResponse(text, talker.id);
  await message.say(reply);
}

const PRICE_PATTERNS = [
  /(多少钱|什么价|价位|报价|价格多少|多少.*钱|怎么卖|价格|price)/i,
  /(how much|cost|price)/i,
];

async function handlePriceQuery(text: string, ctx: CommandContext): Promise<string | null> {
  if (!PRICE_PATTERNS.some(p => p.test(text))) return null;

  const query = text
    .replace(/@\S+/g, '')
    .replace(/[？?！!，,。.：:]/g, '')
    .replace(/(多少钱|什么价|价位|报价|价格多少|怎么卖|多少钱|价格|how much is|what.+(cost|price)|price of|cost of)/gi, '')
    .trim();

  if (!query || query.length > 30) return null;

  await ctx.say(`🔍 正在实时搜索 "${query}" 的价格...`);
  const [amzResults, tbResults, jdResults] = await Promise.all([
    searchAmazonPrice(query).catch(() => [] as any[]),
    searchTaobaoPrice(query).catch(() => [] as any[]),
    searchJdPrice(query).catch(() => [] as any[]),
  ]);
  const results = [...tbResults, ...jdResults, ...amzResults];
  if (results.length === 0) return null;

  const lines = [`💰 "${query}" 实时比价:\n`];
  results.slice(0, 5).forEach((r, i) => {
    lines.push(`${i + 1}. [${r.source}] ${(r.name || '').slice(0, 40)}`);
    lines.push(`   💵 ${r.price || '未知'}`);
    lines.push('');
  });
  lines.push('💡 也可用 /price <商品> 精确搜索');
  return lines.join('\n');
}

async function handleRoomMessage(message: Message, room: any, talker: any, text: string) {
  if (!config.bot.replyRoom) return;

  const isMentioned = await message.mentionSelf();
  if (config.bot.roomAtOnly && !isMentioned) return;

  const roomName = await room.topic();
  logger.info(`Room message from ${talker.name()} in ${roomName}: ${text}`);

  const cleanText = isMentioned
    ? text.replace(/@[^\s]+/g, '').trim()
    : text;

  if (!cleanText) return;

  const ctx = buildContext(talker, room, (t) => room.say(t));

  if (cleanText.startsWith('/')) {
    const cmdReply = await handleCommand(cleanText, ctx);
    if (cmdReply) { await room.say(cmdReply); return; }
  }

  const keywordReply = await handleKeyword(cleanText, ctx);
  if (keywordReply) { await room.say(keywordReply); return; }

  const priceReply = await handlePriceQuery(cleanText, ctx);
  if (priceReply) { await room.say(priceReply); return; }

  await message.say('正在思考...');
  const reply = await getAIResponse(cleanText, room.id, talker.id);
  await room.say(reply);
}

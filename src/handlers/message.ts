import { types } from 'wechaty';
import { config } from '../config';
import { getAIResponse } from '../services/openai';
import { handleCommand, handleKeyword } from '../plugins/registry';
import { CommandContext } from '../plugins/types';
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

  await message.say('正在思考...');
  const reply = await getAIResponse(text, talker.id);
  await message.say(reply);
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

  await message.say('正在思考...');
  const reply = await getAIResponse(cleanText, room.id, talker.id);
  await room.say(reply);
}

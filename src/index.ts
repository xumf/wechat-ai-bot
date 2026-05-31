import { WechatyBuilder } from 'wechaty';
import { config, validateConfig } from './config';
import { onMessage } from './handlers/message';
import { onFriendship } from './handlers/friend';
import { onScan } from './handlers/scan';
import { onLogin } from './handlers/login';
import { onLogout } from './handlers/logout';
import logger from './utils/logger';
import { registerPlugin } from './plugins/registry';
import {
  helpPlugin, clearPlugin, weatherPlugin, reminderPlugin, keywordPlugin,
  translatePlugin, rssPlugin, startRSSPolling, subscribeDaily, startDailyGreeting,
  setBotInstance, setupRoomEvents, pricePlugin, startPriceTracking,
  jokePlugin, hotPlugin, stockPlugin, convertPlugin, roomPlugin,
} from './plugins';

async function main() {
  const errors = validateConfig();
  if (errors.length > 0) {
    console.error('❌ 配置错误:');
    errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }

  console.log('🤖 WeChat AI Bot 启动中...');
  console.log(`   名称: ${config.bot.name}`);
  console.log(`   AI模型: ${config.openai.model}`);

  registerPlugin(helpPlugin);
  registerPlugin(clearPlugin);
  registerPlugin(weatherPlugin);
  registerPlugin(reminderPlugin);
  registerPlugin(keywordPlugin);
  registerPlugin(translatePlugin);
  registerPlugin(rssPlugin);
  registerPlugin(pricePlugin);
  registerPlugin(jokePlugin);
  registerPlugin(hotPlugin);
  registerPlugin(stockPlugin);
  registerPlugin(convertPlugin);
  registerPlugin(roomPlugin);

  const bot = WechatyBuilder.build({
    name: config.bot.memoryName,
    puppet: 'wechaty-puppet-wechat4u' as any,
  });

  setBotInstance(bot);

  bot.on('scan', onScan);
  bot.on('login', onLogin);
  bot.on('logout', onLogout);
  bot.on('message', onMessage);
  bot.on('friendship', onFriendship);

  bot.on('error', (error: any) => {
    logger.error('Bot error', { error: error.message, stack: error.stack });
    console.error('❌ 错误详情:', error);
  });

  bot.on('stop', () => {
    logger.info('Bot stopped');
  });

  try {
    await bot.start();
    console.log(`✅ ${config.bot.name} 已启动`);

    const sayToRoom = async (roomId: string, text: string) => {
      const room = await bot.Room.find({ id: roomId });
      if (room) await room.say(text);
    };

    startRSSPolling(sayToRoom);
    startDailyGreeting(sayToRoom);
    startPriceTracking(sayToRoom);
    setupRoomEvents();
  } catch (error: any) {
    logger.error('Failed to start bot', { error: error.message });
    console.error('❌ 启动失败:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n👋 正在关闭机器人...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 正在关闭机器人...');
  process.exit(0);
});

main();

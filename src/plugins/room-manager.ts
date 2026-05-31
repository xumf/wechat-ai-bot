import { Plugin } from './types';
import logger from '../utils/logger';

let botInstance: any = null;

export function setBotInstance(bot: any) {
  botInstance = bot;
}

export function setupRoomEvents() {
  if (!botInstance) return;

  botInstance.on('room-join', async (room: any, inviteeList: any[], inviter: any) => {
    try {
      const roomName = await room.topic();
      const names = inviteeList.map((c: any) => c.name()).join(', ');
      logger.info(`Room join: ${names} joined ${roomName}`);

      const welcome = `欢迎 ${names} 加入群聊！🎉\n我是AI助手，有问题可以 @我 哦～`;
      await room.say(welcome);
    } catch (e) {
      logger.error('Room join handler error', { error: e });
    }
  });

  botInstance.on('room-leave', async (room: any, leaverList: any[]) => {
    try {
      const roomName = await room.topic();
      const names = leaverList.map((c: any) => c.name()).join(', ');
      logger.info(`Room leave: ${names} left ${roomName}`);
      await room.say(`👋 ${names} 离开了群聊`);
    } catch (e) {
      logger.error('Room leave handler error', { error: e });
    }
  });

  logger.info('Room events (join/leave) initialized');
}

export const roomPlugin: Plugin = {
  name: '群管理',
  description: '/roomid - 获取当前群的群ID',
  commands: ['/roomid'],
  onCommand: async (ctx) => {
    if (!ctx.roomId) return '❌ 请在群聊中使用此命令';
    return `📋 当前群ID:\n${ctx.roomId}`;
  },
};

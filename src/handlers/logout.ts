import logger from '../utils/logger';

export function onLogout(user: any) {
  logger.info(`${user.name()} 已退出登录`);
  console.log(`⚠️ ${user.name()} 已退出登录`);
}

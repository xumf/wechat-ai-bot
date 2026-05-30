import logger from '../utils/logger';

export function onLogin(user: any) {
  logger.info(`${user.name()} 已登录`);
  console.log(`✅ ${user.name()} 已成功登录微信`);
}

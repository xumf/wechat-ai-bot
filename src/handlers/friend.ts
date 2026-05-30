import { types } from 'wechaty';
import { config } from '../config';
import logger from '../utils/logger';

export async function onFriendship(friendship: any) {
  try {
    const contact = friendship.contact();
    const hello = friendship.hello();

    switch (friendship.type()) {
      case types.Friendship.Receive:
        logger.info(`Friend request from ${contact.name()}: ${hello}`);
        if (config.bot.autoAcceptFriend) {
          await friendship.accept();
          logger.info(`Accepted friend: ${contact.name()}`);
          await contact.say(config.bot.autoReplyFriend);
        }
        break;

      case types.Friendship.Confirm:
        logger.info(`Friend confirmed: ${contact.name()}`);
        break;

      default:
        break;
    }
  } catch (error) {
    logger.error('Friendship handler error', { error });
  }
}

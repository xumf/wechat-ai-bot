import schedule from 'node-schedule';
import { getAIResponseWithSystem } from '../services/openai';
import logger from '../utils/logger';

interface DailySub {
  roomId: string;
  hour: number;
  minute: number;
}

const dailySubs: DailySub[] = [];
let dailyJob: schedule.Job | null = null;

export function subscribeDaily(roomId: string, hour = 7, minute = 0) {
  dailySubs.push({ roomId, hour, minute });
  logger.info(`Daily greeting subscribed for room ${roomId} at ${hour}:${minute}`);
}

export function startDailyGreeting(sayToRoom: (roomId: string, text: string) => Promise<void>) {
  if (dailyJob) dailyJob.cancel();

  dailyJob = schedule.scheduleJob('* * * * *', async () => {
    const now = new Date();
    for (const sub of dailySubs) {
      if (now.getHours() === sub.hour && now.getMinutes() === sub.minute) {
        try {
          const greeting = await getAIResponseWithSystem(
            '',
            '请生成一段简短的早安问候，包含今天的日期和一句正能量的话。用中文，不超过50字。'
          );
          await sayToRoom(sub.roomId, `🌅 早安！\n${greeting}`);
        } catch (e) {
          logger.error('Daily greeting failed', { error: e });
        }
      }
    }
  });

  logger.info('Daily greeting service started');
}

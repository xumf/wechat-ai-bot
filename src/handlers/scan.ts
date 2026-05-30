import { ScanStatus } from 'wechaty';
import qrcode from 'qrcode-terminal';
import logger from '../utils/logger';

export function onScan(qrcodeUrl: string, status: ScanStatus) {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    qrcode.generate(qrcodeUrl, { small: true });
    logger.info(`Scan QR code to login. Status: ${status}`);
  } else {
    logger.info(`QR code scan status: ${status}`);
  }
}

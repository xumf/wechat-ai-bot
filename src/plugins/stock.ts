import { Plugin } from './types';
import logger from '../utils/logger';
import iconv from 'iconv-lite';

function fmt(code: string): string {
  const orig = code.trim();
  const upper = orig.toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (/^(SH|SZ|BJ)\d{6}$/i.test(upper)) return upper.toLowerCase();
  if (/^HK\d{5}$/i.test(upper)) return upper.toLowerCase();
  if (/^US[A-Z]{1,5}$/i.test(upper)) return upper.toLowerCase();
  if (/^\d{6}$/.test(upper)) {
    if (upper.startsWith('6') || upper.startsWith('9')) return `sh${upper}`;
    if (upper.startsWith('0') || upper.startsWith('3')) return `sz${upper}`;
    if (upper.startsWith('4') || upper.startsWith('8')) return `bj${upper}`;
    return `sh${upper}`;
  }
  if (/^\d{5}$/.test(upper)) return `hk${upper}`;
  if (/^[A-Z]{1,5}$/i.test(upper)) return `us${orig.toUpperCase()}`;
  return '';
}

async function queryStock(q: string): Promise<string> {
  const code = fmt(q);
  if (!code) return '❌ 格式错误。例: /stock 600519 或 /stock sh000001';

  const resp = await fetch(`https://qt.gtimg.cn/q=${code}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const text = iconv.decode(buf, 'gbk');

  const m = text.match(/"([^"]+)"/);
  if (!m) return '❌ 未找到该股票';

  const f = m[1].split('~');
  if (f.length < 10) return '❌ 未找到该股票';

  const name = f[1];
  const current = f[3];
  const change = f[31];
  const changePct = f[32];
  const high = f[33];
  const low = f[34];

  const sign = parseFloat(change) >= 0 ? '📈' : '📉';
  return [
    `${sign} ${name} (${code.toUpperCase()})`,
    `  当前: ¥${current}`,
    `  涨跌: ${change} (${changePct}%)`,
    `  最高: ¥${high}  最低: ¥${low}`,
  ].join('\n');
}

export const stockPlugin: Plugin = {
  name: '股票',
  description: '/stock <代码> - 实时行情\n  例: /stock 600519 (茅台)',
  commands: ['/stock', '/股票', '/股价'],
  onCommand: async (ctx) => {
    const q = ctx.rawText.replace(/^\s*\/\w+\s*/, '').trim();
    if (!q) return '📊 请输入股票代码。例: /stock 600519';
    return await queryStock(q);
  },
};

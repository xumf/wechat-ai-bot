import { Plugin } from './types';
import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';

const PLATFORM_PATTERNS = [
  { id: 'taobao', name: '淘宝/天猫', patterns: [/taobao\.com|tmall\.com|tb\.cn|m\.tb\.cn/i] },
  { id: 'jd', name: '京东', patterns: [/jd\.com|jd\.hk|item\.m\.jd|3\.cn/i] },
  { id: 'pdd', name: '拼多多', patterns: [/pinduoduo\.com|yangkeduo\.com|pdd\.link|mobile\.yangkeduo/i] },
];

function getPlatform(url: string): { id: string; name: string } | null {
  for (const p of PLATFORM_PATTERNS) {
    if (p.patterns.some(r => r.test(url))) return p;
  }
  return null;
}

function extractItemId(url: string, platform: string): string | null {
  const normalized = url.startsWith('http') ? url : 'https://' + url;
  try {
    const parsed = new URL(normalized);
    if (platform === 'taobao') return parsed.searchParams.get('id');
    if (platform === 'jd') {
      const m = parsed.pathname.match(/(\d+)\.html/);
      return m?.[1] || null;
    }
    if (platform === 'pdd') return parsed.searchParams.get('goods_id');
  } catch {
    // Try regex fallback for malformed URLs
    if (platform === 'taobao') {
      const m = url.match(/[?&]id=(\d+)/);
      return m?.[1] || null;
    }
    if (platform === 'jd') {
      const m = url.match(/(\d+)\.html/);
      return m?.[1] || null;
    }
    if (platform === 'pdd') {
      const m = url.match(/goods_id=(\d+)/);
      return m?.[1] || null;
    }
  }
  return null;
}

function tbSign(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).sort();
  let str = secret;
  for (const k of keys) str += k + params[k];
  str += secret;
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const instructions = `📋 使用前需配置:

淘宝联盟 (阿里妈妈):
  1. 注册 https://pub.alimama.com/
  2. 创建应用 https://open.taobao.com/
  3. .env 添加:
     TB_APP_KEY=你的AppKey
     TB_APP_SECRET=你的AppSecret
     TB_ADZONE_ID=你的推广位ID

京东联盟:
  1. 注册 https://union.jd.com/
  2. .env 添加:
     JD_APP_KEY=你的AppKey
     JD_APP_SECRET=你的AppSecret
     JD_POSITION_ID=你的推广位ID

拼多多推广:
  1. 注册 https://jinbao.pinduoduo.com/
  2. .env 添加:
     PDD_CLIENT_ID=你的ClientId
     PDD_CLIENT_SECRET=你的ClientSecret
     PDD_PID=你的推广位ID`;

async function convertTaobao(url: string): Promise<string> {
  const appKey = process.env.TB_APP_KEY || '';
  const appSecret = process.env.TB_APP_SECRET || '';
  const adzoneId = process.env.TB_ADZONE_ID || '';
  if (!appKey || !appSecret || !adzoneId) {
    return `❌ 未配置淘宝联盟 API\n请先在 .env 设置 TB_APP_KEY, TB_APP_SECRET, TB_ADZONE_ID`;
  }

  const itemId = extractItemId(url, 'taobao');
  if (!itemId) return '❌ 无法识别淘宝商品ID，请使用商品详情页链接';

  const params: Record<string, string> = {
    method: 'taobao.tbk.item.convert',
    app_key: appKey,
    timestamp: ts(),
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    fields: 'num_iid,click_url',
    num_iids: itemId,
    adzone_id: adzoneId,
    platform: '2',
  };
  params.sign = tbSign(params, appSecret);

  try {
    const res = await axios.get('https://gw.api.taobao.com/router/rest', { params, timeout: 10000 });
    const body = res.data;
    if (body.error_response) {
      return `❌ 淘宝API错误: ${body.error_response.sub_msg || body.error_response.msg}`;
    }
    const items = body?.tbk_item_convert_response?.results?.n_tbk_item;
    if (items?.length && items[0].click_url) {
      return `✅ 淘宝推广链接已生成:\n${items[0].click_url}`;
    }
    return '❌ 淘宝API未返回推广链接，请检查商品ID是否有效';
  } catch (e: any) {
    return `❌ 请求淘宝API失败: ${e.message}`;
  }
}

async function convertJd(_url: string): Promise<string> {
  const configured = !!(process.env.JD_APP_KEY && process.env.JD_APP_SECRET);
  if (!configured) return `❌ 京东联盟功能待配置\n请在 .env 设置 JD_APP_KEY, JD_APP_SECRET, JD_POSITION_ID`;
  return '❌ 京东API对接开发中，敬请期待';
}

async function convertPdd(_url: string): Promise<string> {
  const configured = !!(process.env.PDD_CLIENT_ID && process.env.PDD_CLIENT_SECRET);
  if (!configured) return `❌ 拼多多推广功能待配置\n请在 .env 设置 PDD_CLIENT_ID, PDD_CLIENT_SECRET, PDD_PID`;
  return '❌ 拼多多API对接开发中，敬请期待';
}

export const convertPlugin: Plugin = {
  name: '转链',
  description: '/convert <链接> 或 /转链 <链接> - 商品链接转推广链接\n  支持: 淘宝/天猫, 京东, 拼多多',
  commands: ['/convert', '/转链'],
  onCommand: async (ctx) => {
    const url = ctx.args[0];
    if (!url) return `❌ 请提供商品链接\n用法: /convert <链接>\n\n${instructions}`;
    if (url === 'help' || url === '帮助') return instructions;

    const platform = getPlatform(url);
    if (!platform) return '❌ 不支持的链接\n目前支持: 淘宝/天猫, 京东, 拼多多';

    await ctx.say(`🔍 正在处理 ${platform.name} 链接...`);

    if (platform.id === 'taobao') return convertTaobao(url);
    if (platform.id === 'jd') return convertJd(url);
    if (platform.id === 'pdd') return convertPdd(url);

    return '❌ 不支持的平台';
  },
  onMessage: async (text) => {
    const trimmed = text.trim();
    const urlMatch = trimmed.match(/^(https?:\/\/[^\s]+)/);
    if (!urlMatch) return null;

    const platform = getPlatform(urlMatch[1]);
    if (!platform) return null;

    const hasKeys = !!(process.env.TB_APP_KEY || process.env.JD_APP_KEY || process.env.PDD_CLIENT_ID);
    if (!hasKeys) return null;

    return `📦 检测到${platform.name}商品链接\n回复 /convert ${urlMatch[1]} 可转为推广链接`;
  },
};

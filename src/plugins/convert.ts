import { Plugin } from './types';
import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';

const PLATFORM_PATTERNS = [
  { id: 'taobao', name: '淘宝/天猫', patterns: [/taobao\.com|tmall\.com|tb\.cn|m\.tb\.cn|e\.tb\.cn/i] },
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
    if (platform === 'taobao') {
      return parsed.searchParams.get('id')
        || parsed.searchParams.get('shareDetailItemId')
        || null;
    }
    if (platform === 'jd') {
      const m = parsed.pathname.match(/(\d+)\.html/);
      return m?.[1] || null;
    }
    if (platform === 'pdd') return parsed.searchParams.get('goods_id');
  } catch {
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

async function followRedirect(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, { timeout: 10000, maxRedirects: 5, responseType: 'text' });
    return res.request?.res?.responseUrl || res.request?.responseURL || url;
  } catch {
    return null;
  }
}

async function followShortUrl(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, { timeout: 10000, responseType: 'text' });
    const html = res.data;
    // Look for shareDetailItemId in the HTML (Taobao short links)
    const itemId = html.match(/shareDetailItemId=(\d+)/);
    if (itemId) return itemId[1];
    // Fallback: look for id= in URLs
    const idMatch = html.match(/[?&]id=(\d+)/);
    if (idMatch) return idMatch[1];
    // Fallback: look for any item URL
    const urlMatch = html.match(/https?:\/\/[^\s"']*(?:taobao|tmall)[^\s"']*/);
    if (urlMatch) {
      const parsed = new URL(urlMatch[0]);
      return parsed.searchParams.get('id') || parsed.searchParams.get('shareDetailItemId') || null;
    }
    return null;
  } catch {
    return null;
  }
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

  let itemId = extractItemId(url, 'taobao');
  if (!itemId) itemId = await followShortUrl(url);
  if (!itemId) return '❌ 无法识别淘宝商品ID，请使用商品详情页链接';

  async function tbApi(method: string, extra: Record<string, string>) {
    const p: Record<string, string> = { method, app_key: appKey, timestamp: ts(), format: 'json', v: '2.0', sign_method: 'md5', ...extra };
    p.sign = tbSign(p, appSecret);
    return (await axios.get('https://gw.api.taobao.com/router/rest', { params: p, timeout: 10000 })).data;
  }

  // Try item.convert first
  let body = await tbApi('taobao.tbk.item.convert', { fields: 'num_iid,click_url', num_iids: itemId, adzone_id: adzoneId, platform: '2' }).catch(e => ({ error_response: { sub_msg: e.message } }));
  let err = body?.error_response;

  if (!err) {
    const items = body?.tbk_item_convert_response?.results?.n_tbk_item;
    if (items?.length && items[0].click_url) {
      return `✅ 淘宝推广链接已生成:\n${items[0].click_url}`;
    }
  }

  // If convert is blocked by permissions, try item.info.get as fallback
  if (err && (err.code === 11 || err.sub_code?.includes('permission'))) {
    // Try taobao.tbk.item.info.get (user has scope 16189)
    const infoBody = await tbApi('taobao.tbk.item.info.get', { fields: 'num_iid,title,item_url,pict_url,reserve_price,zk_final_price', num_iids: itemId, platform: '2' }).catch(() => null);
    const infoErr = infoBody?.error_response;
    if (infoErr && infoErr.sub_msg?.includes('新商品ID')) {
      return `❌ 该商品已升级为新ID格式，\ntaobao.tbk.item.convert 权限暂未开放\n目前仅支持京东、拼多多的推广转链`;
    }
    const item = infoBody?.tbk_item_info_get_response?.results?.n_tbk_item?.[0];
    if (item) {
      return `📦 ${item.title}\n💰 ¥${item.zk_final_price || item.reserve_price || '?'}\n🔗 ${item.item_url}\n\n⚠️ taobao.tbk.item.convert 权限未开放，无法生成推广链接\n可尝试京东/拼多多链接转链`;
    }
    return `❌ 淘宝商品链接转换功能暂不可用\n原因: AppKey 缺少 taobao.tbk.item.convert 权限\n此接口为邀约制，需联系淘宝联盟申请开通`;
  }

  if (err) return `❌ 淘宝API错误: ${err.sub_msg || err.msg}`;
  return '❌ 淘宝API未返回推广链接';
}

async function convertJd(url: string): Promise<string> {
  const appKey = process.env.JD_APP_KEY || '';
  const appSecret = process.env.JD_APP_SECRET || '';
  const positionId = process.env.JD_POSITION_ID || '';
  const siteId = process.env.JD_SITE_ID || '';
  if (!appKey || !appSecret) {
    return `❌ 未配置京东联盟 API\n请在 .env 设置 JD_APP_KEY, JD_APP_SECRET, JD_POSITION_ID`;
  }
  if (!siteId) {
    return `❌ 缺少京东站点ID (siteId)\n请登录 https://union.jd.com/ → 推广管理 → 网站/APP管理\n获取数字站点ID后添加到 .env: JD_SITE_ID=你的站点ID`;
  }

  // Resolve short URLs (3.cn)
  let resolvedUrl = url;
  if (/3\.cn/i.test(url)) {
    const finalUrl = await followRedirect(url);
    if (finalUrl) {
      // The redirect may land on a risk handler page with returnurl
      const returnUrlMatch = finalUrl.match(/returnurl=([^&]+)/);
      if (returnUrlMatch) {
        resolvedUrl = decodeURIComponent(returnUrlMatch[1]);
      } else {
        resolvedUrl = finalUrl;
      }
    }
  }

  const materialId = extractItemId(resolvedUrl, 'jd');
  if (!materialId) return '❌ 无法识别京东商品ID';

  const itemUrl = resolvedUrl.startsWith('http') ? resolvedUrl.match(/https?:\/\/[^\s]+/)?.[0] || '' : `https://item.jd.com/${materialId}.html`;
  const bizJson = JSON.stringify({
    promotionCodeReq: {
      materialId: itemUrl,
      siteId: siteId,
      positionId: Number(positionId) || 0,
      chainType: 2,
      sceneId: 2,
    },
  });

  const params: Record<string, string> = {
    method: 'jd.union.open.promotion.common.get',
    app_key: appKey,
    timestamp: ts(),
    format: 'json',
    v: '1.0',
    '360buy_param_json': bizJson,
  };
  params.sign = tbSign(params, appSecret);

  try {
    const res = await axios.get('https://api.jd.com/routerjson', { params, timeout: 10000 });
    const body = res.data;
    if (body.error_response) {
      const err = body.error_response;
      if (err.zh_desc) return `❌ 京东API错误: ${err.zh_desc}`;
      return `❌ 京东API错误: ${err.msg || JSON.stringify(err)}`;
    }
    const resp = body?.jd_union_open_promotion_common_get_response
      || body?.jd_union_open_promotion_common_get_responce;
    const result = resp?.result;
    if (result) {
      let data: any;
      try { data = typeof result === 'string' ? JSON.parse(result) : result; } catch { data = result; }
      if (data?.data?.clickURL) {
        return `✅ 京东推广链接已生成:\n${data.data.clickURL}`;
      }
      if (data?.clickURL) {
        return `✅ 京东推广链接已生成:\n${data.clickURL}`;
      }
    }
    return '❌ 京东API未返回推广链接';
  } catch (e: any) {
    return `❌ 请求京东API失败: ${e.message}`;
  }
}

function signPdd(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).sort();
  let str = secret;
  for (const k of keys) str += k + params[k];
  str += secret;
  return crypto.createHash('md5').update(str).digest('hex').toLowerCase();
}

async function convertPdd(url: string): Promise<string> {
  const clientId = process.env.PDD_CLIENT_ID || '';
  const clientSecret = process.env.PDD_CLIENT_SECRET || '';
  const pid = process.env.PDD_PID || '';
  if (!clientId || !clientSecret) {
    return `❌ 未配置拼多多推广 API\n请先在 .env 设置 PDD_CLIENT_ID, PDD_CLIENT_SECRET, PDD_PID`;
  }

  const goodsId = extractItemId(url, 'pdd');
  if (!goodsId) return '❌ 无法识别拼多多商品ID';

  const params: Record<string, string> = {
    type: 'pdd.ddk.oauth.goods.prom.url.generate',
    client_id: clientId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    data_type: 'JSON',
    version: 'V1',
    goods_id_list: `["${goodsId}"]`,
    p_id: pid || '',
    generate_short_url: 'true',
    multi_weapp_webview: 'true',
  };
  params.sign = signPdd(params, clientSecret);

  try {
    const res = await axios.post('https://gw-api.pinduoduo.com/api/router', null, { params, timeout: 10000 });
    const body = res.data;
    if (body.error_response) {
      return `❌ 拼多多API错误: ${body.error_response.error_msg || JSON.stringify(body.error_response)}`;
    }
    const goodsProm = body?.goods_prom_url_generate_response?.goods_prom_url_list?.[0];
    if (goodsProm) {
      const link = goodsProm.we_app_web_view_short_url || goodsProm.we_short_url || goodsProm.url || goodsProm.short_url;
      if (link) return `✅ 拼多多推广链接已生成:\n${link}`;
    }
    return '❌ 拼多多API未返回推广链接';
  } catch (e: any) {
    return `❌ 请求拼多多API失败: ${e.message}`;
  }
}

export const convertPlugin: Plugin = {
  name: '转链',
  description: '/convert <链接> 或 /转链 <链接> - 商品链接转推广链接\n  支持: 淘宝/天猫, 京东, 拼多多',
  commands: ['/convert', '/转链'],
  onCommand: async (ctx) => {
    const raw = ctx.args.join(' ');
    const urlMatch = raw.match(/https?:\/\/[^\s\]）\)》】,，]+/);
    const url = urlMatch?.[0] || ctx.args[0];
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
    const urlMatch = text.match(/https?:\/\/[^\s\]）\)》】,，]+/);
    if (!urlMatch) return null;

    const url = urlMatch[0];
    const platform = getPlatform(url);
    if (!platform) return null;

    const hasKeys = !!(process.env.TB_APP_KEY || process.env.JD_APP_KEY || process.env.PDD_CLIENT_ID);
    if (!hasKeys) return null;

    return `📦 检测到${platform.name}商品链接\n回复 /convert ${url} 可转为推广链接`;
  },
};

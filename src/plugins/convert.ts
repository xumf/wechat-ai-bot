import { Plugin } from './types';
import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';
import { convertTaobaoLink } from '../services/scraper';

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
  const pad = (n: number) => String(n).padStart(2, '0');
  // Use GMT+8 (China Standard Time) regardless of server timezone
  const d = new Date();
  const cst = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = cst.getUTCFullYear();
  const m = pad(cst.getUTCMonth() + 1);
  const day = pad(cst.getUTCDate());
  const h = pad(cst.getUTCHours());
  const min = pad(cst.getUTCMinutes());
  const s = pad(cst.getUTCSeconds());
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
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
  // Resolve short URLs (e.tb.cn, m.tb.cn)
  let resolvedUrl = url;
  if (/e\.tb\.cn|m\.tb\.cn/i.test(url)) {
    const finalUrl = await followShortUrl(url);
    if (finalUrl) resolvedUrl = finalUrl;
  }

  // Use Playwright to automate the 万能转链 tool
  const link = await convertTaobaoLink(resolvedUrl);
  if (link) {
    return `✅ 淘宝推广链接已生成:\n${link}`;
  }

  // Fallback: try API (may fail due to permission)
  const appKey = process.env.TB_APP_KEY || '';
  const appSecret = process.env.TB_APP_SECRET || '';
  const adzoneId = process.env.TB_ADZONE_ID || '';
  if (!appKey || !appSecret || !adzoneId) {
    return `❌ 淘宝推广链接转换失败\n未配置淘宝联盟API，请检查登录状态或配置 .env`;
  }

  let itemId = extractItemId(resolvedUrl, 'taobao');
  if (!itemId) itemId = await followShortUrl(resolvedUrl);
  if (!itemId) return '❌ 无法识别淘宝商品ID，请使用商品详情页链接';

  async function tbApi(method: string, extra: Record<string, string>) {
    const p: Record<string, string> = { method, app_key: appKey, timestamp: ts(), format: 'json', v: '2.0', sign_method: 'md5', ...extra };
    p.sign = tbSign(p, appSecret);
    return (await axios.get('https://gw.api.taobao.com/router/rest', { params: p, timeout: 10000 })).data;
  }

  let body = await tbApi('taobao.tbk.item.convert', { fields: 'num_iid,click_url', num_iids: itemId, adzone_id: adzoneId, platform: '2' }).catch(e => ({ error_response: { sub_msg: e.message } }));
  let err = body?.error_response;

  if (!err) {
    const items = body?.tbk_item_convert_response?.results?.n_tbk_item;
    if (items?.length && items[0].click_url) {
      return `✅ 淘宝推广链接已生成:\n${items[0].click_url}`;
    }
  }

  if (err) return `❌ 淘宝推广链接转换失败\n请检查淘宝联盟登录状态\n或配置 .env 中的 TB_APP_KEY, TB_APP_SECRET, TB_ADZONE_ID`;
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
    return `❌ 缺少京东站点ID (siteId)\n\n京东联盟有两种媒体类型:\n1. 网站/APP - 需要ICP备案域名，siteId填网站ID\n2. 导购媒体 - 需要申请 unionId 权限\n\n请登录 https://union.jd.com/ → 推广管理 → 查看你的媒体类型\n如是网站/APP: 获取数字站点ID填入 .env JD_SITE_ID=xxx\n如是导购: 需申请 jd.union.open.promotion.byunionid.get 权限`;
  }

  // Resolve short URLs (3.cn)
  let resolvedUrl = url;
  if (/3\.cn/i.test(url)) {
    const finalUrl = await followRedirect(url);
    if (finalUrl) {
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
    const resultStr = resp?.getResult || resp?.result;
    if (resultStr) {
      let data: any;
      try { data = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr; } catch { data = resultStr; }
      if (data.code && data.code !== 200) {
        const msg = data.message || JSON.stringify(data);
        if (msg.includes('导购') || msg.includes('siteId')) {
          return `❌ 京东API错误: ${msg}\n\n你的媒体类型是"导购"，不支持此API\n需要申请 jd.union.open.promotion.byunionid.get 权限\n使用 unionId 代替 siteId`;
        }
        return `❌ 京东API错误: ${msg}`;
      }
      if (data?.data?.clickURL) {
        return `✅ 京东推广链接已生成:\n${data.data.clickURL}`;
      }
      if (data?.clickURL) {
        return `✅ 京东推广链接已生成:\n${data.clickURL}`;
      }
      if (data?.shortURL) {
        return `✅ 京东推广链接已生成:\n${data.shortURL}`;
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
  return crypto.createHash('md5').update(str).digest('hex').toUpperCase();
}

async function extractPddGoodsSign(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, { timeout: 10000, responseType: 'text', maxRedirects: 5 });
    const html = res.data;
    // Look for goodsSign in page source
    const match = html.match(/goodsSign['":\s]*['"]([^'"]+)['"]/i)
      || html.match(/goods_sign['":\s]*['"]([^'"]+)['"]/i)
      || html.match(/"goodsSign"\s*:\s*"([^"]+)"/i);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

async function convertPdd(url: string): Promise<string> {
  const clientId = process.env.PDD_CLIENT_ID || '';
  const clientSecret = process.env.PDD_CLIENT_SECRET || '';
  const pid = process.env.PDD_PID || '';
  if (!clientId || !clientSecret) {
    return `❌ 未配置拼多多推广 API\n请先在 .env 设置 PDD_CLIENT_ID, PDD_CLIENT_SECRET, PDD_PID`;
  }

  // Resolve short URLs to get goods_id
  let resolvedUrl = url;
  if (/mobile\.yangkeduo\.com.*ps=/.test(url) || /yangkeduo\.com\/goods2\.html\?ps=/.test(url)) {
    const finalUrl = await followRedirect(url);
    if (finalUrl) resolvedUrl = finalUrl;
  }

  const goodsId = extractItemId(resolvedUrl, 'pdd');
  if (!goodsId) return '❌ 无法识别拼多多商品ID';

  // Use rp.prom.url.generate for general promotion (no goods_sign needed)
  const params: Record<string, string> = {
    type: 'pdd.ddk.rp.prom.url.generate',
    client_id: clientId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    data_type: 'JSON',
    version: 'V1',
    p_id_list: JSON.stringify([pid]),
    channel_type: '10',
    generate_short_url: 'true',
    generate_we_app: 'true',
  };
  params.sign = signPdd(params, clientSecret);

  try {
    const res = await axios.post('https://gw-api.pinduoduo.com/api/router',
      new URLSearchParams(params).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, timeout: 10000 }
    );
    const body = res.data;
    if (body.error_response) {
      return `❌ 拼多多API错误: ${body.error_response.error_msg || JSON.stringify(body.error_response)}`;
    }
    // Handle general promotion response
    const rpProm = body?.rp_promotion_url_generate_response?.url_list?.[0];
    if (rpProm) {
      const link = rpProm.mobile_short_url || rpProm.short_url || rpProm.url;
      if (link) return `✅ 拼多多推广链接已生成:\n${link}`;
    }
    // Handle single product response
    const goodsProm = body?.goods_promotion_url_generate_response?.goods_promotion_url_list?.[0];
    if (goodsProm) {
      const link = goodsProm.mobile_short_url || goodsProm.short_url || goodsProm.mobile_url || goodsProm.url;
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

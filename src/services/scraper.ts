import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserContext, Page } from 'playwright';
import logger from '../utils/logger';

chromium.use(StealthPlugin());

const PROFILE_DIR = path.join(__dirname, '../../data/browser-profile');
const COOKIE_FILE = path.join(__dirname, '../../data/cookies.json');

let ctx: BrowserContext | null = null;

async function getContext(): Promise<BrowserContext> {
  if (!ctx) {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      if (fs.existsSync(COOKIE_FILE)) {
        const allCookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
        const tbCookies = allCookies.filter((c: any) =>
          c.domain.includes('taobao') || c.domain.includes('tmall')
        );
        if (tbCookies.length > 0) {
          await ctx.addCookies(tbCookies);
          logger.info(`Loaded ${tbCookies.length} Taobao cookies from backup`);
        }
      }
    } catch (e: any) {
      logger.warn('Failed to load backup cookies', { error: e.message });
    }
  }
  return ctx;
}

export interface PriceResult {
  name: string;
  price: string;
  url: string;
  source: string;
}

export async function searchTaobaoPrice(keyword: string): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  let page: Page | null = null;
  try {
    const ctx = await getContext();
    page = await ctx.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(
      `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}`,
      { waitUntil: 'domcontentloaded', timeout: 20000 },
    );
    await page.waitForTimeout(4000);

    const cards = await page.evaluate(() => {
      const items: { title: string; price: string; link: string }[] = [];
      document.querySelectorAll('div[class*="doubleCard"]').forEach(card => {
        const linkEl = card.closest('a') || card.querySelector('a');
        const titleEl = card.querySelector('[class*="title--"]');
        const priceWrapper = card.querySelector('[class*="priceWrapper"]');
        const title = titleEl?.getAttribute('title') || titleEl?.textContent?.trim?.() || '';
        const priceText = priceWrapper?.textContent?.trim?.() || '';
        const price = priceText.match(/[\d,]+\.?\d*/)?.[0] || '';
        const link = linkEl?.href || '';
        if (title && price) items.push({ title: title.slice(0, 80), price, link });
      });
      return items;
    });

    for (const c of cards.slice(0, 5)) {
      results.push({
        name: c.title,
        price: `¥${c.price.replace(/[^0-9.]/g, '')}`,
        url: c.link,
        source: '淘宝',
      });
    }
  } catch (e: any) {
    logger.error('Taobao search error', { error: e.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return results;
}

export async function searchJdPrice(keyword: string): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  let page: Page | null = null;
  try {
    const ctx = await getContext();
    page = await ctx.newPage();
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(
      `https://search.jd.com/Search?keyword=${encodeURIComponent(keyword)}`,
      { waitUntil: 'domcontentloaded', timeout: 20000 },
    );
    await page.waitForTimeout(5000);

    const results_js = await page.evaluate(() => {
      const items: { title: string; price: string; link: string }[] = [];
      document.querySelectorAll('li.gl-item').forEach(li => {
        const nameEl = li.querySelector('.p-name a, .p-name em');
        const priceEl = li.querySelector('.p-price strong i, .p-price');
        const linkEl = li.querySelector('.p-name a');
        const title = nameEl?.textContent?.trim?.() || '';
        const priceText = priceEl?.textContent?.trim?.() || '';
        const price = priceText.replace(/[^0-9.]/g, '');
        const link = linkEl?.getAttribute?.('href') || '';
        if (title && price) items.push({ title: title.slice(0, 80), price, link });
      });
      return items;
    });

    for (const c of results_js.slice(0, 5)) {
      results.push({
        name: c.title,
        price: `¥${c.price}`,
        url: c.link.startsWith('http') ? c.link : `https:${c.link}`,
        source: '京东',
      });
    }
  } catch (e: any) {
    logger.error('JD search error', { error: e.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return results;
}

export async function searchAmazonPrice(keyword: string): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  let page: Page | null = null;
  try {
    const ctx = await getContext();
    page = await ctx.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(
      `https://www.amazon.com/s?k=${encodeURIComponent(keyword)}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    await page.waitForTimeout(3000);

    const items = await page.$$('[data-component-type="s-search-result"]');
    for (let i = 0; i < Math.min(items.length, 5); i++) {
      try {
        const title = await items[i].$eval('h2', (el: any) => el.textContent?.trim() || '');
        const priceWhole = await items[i].$eval('.a-price-whole', (el: any) => el.textContent?.trim() || '').catch(() => '');
        const priceFrac = await items[i].$eval('.a-price-fraction', (el: any) => el.textContent?.trim() || '').catch(() => '');
        const link = await items[i].$eval('a.a-link-normal', (el: any) => el.href || '').catch(() => '');
        const price = priceWhole ? `${priceWhole}${priceFrac}` : '';
        if (title && price) {
          results.push({
            name: title.slice(0, 80),
            price: `¥${price}`,
            url: link.startsWith('http') ? link : `https://www.amazon.com${link}`,
            source: '亚马逊',
          });
        }
      } catch { /* skip */ }
    }
  } catch (e: any) {
    logger.error('Amazon search error', { error: e.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
  return results;
}

export async function scrapeUrlPrice(url: string): Promise<{ name: string; price: number } | null> {
  let page: Page | null = null;
  try {
    const ctx = await getContext();
    page = await ctx.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const title = await page.title();

    const price = await page.evaluate(() => {
      const selectors = [
        '.a-price-whole',
        '.a-price',
        '.price',
        '.p-price i',
        '[class*="price"]',
        '#price',
        '.tm-price',
        '.tb-rmb-num',
        '[class*="Price"]',
        '[class*="money"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent) {
          const m = el.textContent.match(/[\d,]+\.?\d*/);
          if (m) return { price: parseFloat(m[0].replace(/,/g, '')) };
        }
      }
      const text = document.body.innerText;
      const m = text.match(/[¥￥$]\s*([\d,]+\.?\d{0,2})/);
      if (m) return { price: parseFloat(m[1].replace(/,/g, '')) };
      return null;
    });

    if (!price?.price) return null;
    return { name: title.replace(/[_-].*$/, '').trim().slice(0, 60), price: price.price };
  } catch (e: any) {
    logger.error('URL price scrape error', { error: e.message });
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

export async function getBrowserContext(): Promise<BrowserContext> {
  return getContext();
}

export async function convertTaobaoLink(productUrl: string): Promise<string | null> {
  try {
    // Load cookies from file
    if (!fs.existsSync(COOKIE_FILE)) return null;
    const allCookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
    const almCookies = allCookies.filter((c: any) => c.domain.includes('alimama'));
    if (almCookies.length === 0) return null;

    // Build cookie string
    const cookieStr = almCookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

    // Extract _tb_token_ from cookies
    const tbToken = almCookies.find((c: any) => c.name === '_tb_token_')?.value || '';
    const lid = almCookies.find((c: any) => c.name === 'lid')?.value || '';

    if (!tbToken || !lid) {
      logger.warn('Missing _tb_token_ or lid in Alimama cookies');
      return null;
    }

    // Extract PID from refpid or use default
    const refpid = process.env.TB_ADZONE_ID ? `mm_0_0_${process.env.TB_ADZONE_ID}` : '';

    const variableMap = JSON.stringify({
      url: `【淘宝】${productUrl}`,
      superRedSwitch: '0',
      union_lens: '',
      lensScene: 'PUB',
      spmB: '_portal_v2_tool_links_page_home_index_htm',
    });

    const params = new URLSearchParams({
      t: String(Date.now()),
      _tb_token_: tbToken,
      floorId: '61446',
      refpid: refpid,
      variableMap: variableMap,
    });

    const res = await axios.post(
      'https://pub.alimama.com/openapi/param2/1/gateway.unionpub/xt.entry.json',
      params.toString(),
      {
        headers: {
          'accept': '*/*',
          'accept-language': 'zh-CN,zh;q=0.9',
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'cookie': cookieStr,
          'referer': 'https://pub.alimama.com/portal/v2/tool/links/page/home/index.htm',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
          'x-requested-with': 'XMLHttpRequest',
        },
        timeout: 15000,
      }
    );

    const data = res.data;
    if (data.error) {
      logger.warn('Alimama API error', { error: data.error });
      return null;
    }

    // Extract the promotion link from response
    const result = data?.data?.model || data?.data;
    if (result?.shortLinkUrl) return result.shortLinkUrl;
    if (result?.clickUrl) return result.clickUrl;
    if (result?.couponLink) return result.couponLink;

    // Try to find any URL in the response
    const str = JSON.stringify(data);
    const urlMatch = str.match(/https?:\/\/[^\s"']*(?:taobao|tmall|tb\.cn)[^\s"']*/);
    if (urlMatch) return urlMatch[0];

    logger.warn('Could not extract link from Alimama response', { data });
    return null;
  } catch (e: any) {
    logger.error('Alimama API call failed', { error: e.message });
    return null;
  }
}

export async function closeContext() {
  if (ctx) {
    await ctx.close();
    ctx = null;
  }
}

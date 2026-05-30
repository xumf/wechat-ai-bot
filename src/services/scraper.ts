import { chromium, Browser, Page } from 'playwright';
import logger from '../utils/logger';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browser;
}

function extractPrice(text: string): number | null {
  const m = text.match(/[\d,]+\.?\d*/);
  if (m) return parseFloat(m[0].replace(/,/g, ''));
  return null;
}

export interface PriceResult {
  name: string;
  price: string;
  url: string;
  source: string;
}

export async function searchAmazonPrice(keyword: string): Promise<PriceResult[]> {
  const results: PriceResult[] = [];
  let page: Page | null = null;
  try {
    const b = await getBrowser();
    page = await b.newPage();
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
    const b = await getBrowser();
    page = await b.newPage();
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

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

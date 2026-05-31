# WeChat AI Bot — Agents Guide

## Quick start

```bash
npm run dev      # ts-node, for development
npm run build    # tsc
npm start        # node dist/index.js
npm run login:china  # headful browser to log into Taobao/JD for price scraping
```

`.env` is required (see `.env.example`). API: DeepSeek at `https://api.deepseek.com`, model `deepseek-v4-flash`.

## Architecture

- **Entry**: `src/index.ts` — builds `WechatyBuilder` with `wechaty-puppet-wechat4u` (pure Node.js, no Chrome dependency for WeChat login).
- **Message routing** (`src/handlers/message.ts`): command (`/`) → keyword match → price intent detection → AI fallback.
- **Plugins** (`src/plugins/`): each exports a `Plugin` object via `registerPlugin()`. Commands defined in `commands[]`, matched by `handleCommand()` in `registry.ts`.
- **Price scraping** (`src/services/scraper.ts`): Playwright + stealth plugin, persistent browser profile at `data/browser-profile`. Cookies backup at `data/cookies.json` (only Taobao cookies injected from JSON).

## Gotchas

- **`ctx.rawText`** in `CommandContext` is set by `handleCommand()` in `registry.ts`. Plugins reading `ctx.rawText` (translate, price) will break if new code forgets to set it.
- **Taobao affiliate**: Uses Playwright automation on https://pub.alimama.com/portal/v2/tool/links/page/home/index.htm (万能转链 tool). Requires logged-in session via `npm run login:china`. API fallback with `taobao.tbk.item.convert` may fail due to invitation-only permission.
- **JD search** is blocked by anti-scraping ("访问频繁"). Login works (persistent profile), search doesn't. Fixing JD requires `playwright-extra` stealth upgrades, different IP/proxy, or headful mode.
- **JD affiliate API** (`jd.union.open.promotion.common.get`): requires `promotionCodeReq` wrapper + `sceneId=2` for item links + numeric `siteId` (not appKey UUID). `siteId` must be from a 网站/APP type media in JD Union backend (not 导购). Response key is `getResult` (not `result`).
- **Amazon search** works with no auth needed.
- **Login flow**: `npm run login:china` opens headful Chrome, user logs in, presses Enter to save. Must re-run when cookies expire.
- **GitHub push** over HTTPS is blocked on this network; use SSH (`git@github.com:xumf/wechat-ai-bot.git`).
- **Data files** in `data/` are gitignored (profile, cookies, price-tracks, RSS state).

## Plugin system

```typescript
interface Plugin {
  name: string;
  description: string;
  commands?: string[];      // e.g. ['/price', '/比价']
  onCommand?: (ctx: CommandContext) => Promise<string | null>;
  onMessage?: (text: string, ctx: CommandContext) => Promise<string | null>;
}
```

All plugins registered in `src/index.ts` before `bot.start()`. Active: help, clear, weather, reminder, keyword, translate, rss, price, joke, hot, stock.

## Scheduled tasks

- RSS feeds: polling every 30 min
- Price tracking: every 6 hours
- Daily greeting: 7:00 AM
- Room events: welcome on join, notice on leave

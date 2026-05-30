FROM node:20-slim

# Playwright system dependencies + CJK fonts for Chinese pages
RUN apt-get update && apt-get install -y \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright's system deps for chromium
RUN npx playwright install-deps chromium-headless-shell && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && \
    npm prune --production && \
    npx playwright install chromium-headless-shell

# Persistent data (browser profile, cookies, price tracks, rss state)
VOLUME /app/data

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0

CMD ["node", "dist/index.js"]

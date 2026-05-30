FROM node:20-slim

# === China mirrors ===
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null; \
    true

ENV NPM_REGISTRY=https://registry.npmmirror.com

# Playwright system dependencies + CJK fonts
RUN apt-get update && apt-get install -y \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN npx playwright install-deps chromium-headless-shell && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry $NPM_REGISTRY && \
    npm ci

COPY . .
RUN npm run build && \
    npm prune --production && \
    npx playwright install chromium-headless-shell

VOLUME /app/data

CMD ["node", "dist/index.js"]
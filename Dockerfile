FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock* ./
RUN npm install

COPY . .
RUN npm run build

ENV PUPPETEER_HEADLESS=true
ENV PUPPETEER_EXEC_PATH=/usr/bin/chromium

CMD ["node", "dist/index.js"]

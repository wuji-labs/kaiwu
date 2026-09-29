FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src/ ./src/

RUN node -e "const fs = require('fs'); const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); pkg.type = 'module'; fs.writeFileSync('package.json', JSON.stringify(pkg));"
# TypeScript compilation using npx typescript or directly copying if running via strip-types
RUN npm install -g typescript && tsc -p tsconfig.json

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3010 \
    OTA_DATA_DIR=/data \
    OTA_PRIVATE_KEY_PATH=/secrets/private-key.pem \
    OTA_PUBLIC_BASE_URL=https://kaiwu.chengqiyun.com/ota

RUN mkdir -p /data /secrets && chown -R node:node /app /data /secrets

COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/dist ./dist

USER node

EXPOSE 3010

VOLUME ["/data", "/secrets"]

CMD ["node", "dist/index.js"]

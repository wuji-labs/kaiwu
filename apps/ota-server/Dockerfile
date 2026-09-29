# Kaiwu OTA server. Build `dist/` first (`npm run build` in this directory, which uses the repo's
# TypeScript), then build the image. The server has no runtime npm dependencies.
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3010 \
    OTA_DATA_DIR=/data \
    OTA_PRIVATE_KEY_PATH=/secrets/private-key.pem \
    OTA_PUBLIC_BASE_URL=https://kaiwu.chengqiyun.com/ota

COPY --chown=node:node package.json ./
COPY --chown=node:node dist/ ./dist/

USER node

EXPOSE 3010

CMD ["node", "dist/index.js"]

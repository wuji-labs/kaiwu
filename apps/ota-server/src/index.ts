import path from 'node:path';
import { createOtaServer } from './server.js';
import type { OtaServerConfig } from './types.js';

const config: OtaServerConfig = {
  port: parseInt(process.env.PORT || '3010', 10),
  dataDir: process.env.OTA_DATA_DIR || path.resolve(process.cwd(), 'data'),
  privateKeyPath: process.env.OTA_PRIVATE_KEY_PATH || '',
  publicBaseUrl: process.env.OTA_PUBLIC_BASE_URL || 'https://kaiwu.chengqiyun.com/ota',
};

const server = createOtaServer(config);

server.listen(config.port, () => {
  console.log(`[ota-server] Listening on port ${config.port}`);
  console.log(`[ota-server] Data directory: ${config.dataDir}`);
  console.log(`[ota-server] Public base URL: ${config.publicBaseUrl}`);
  console.log(`[ota-server] Private key configured: ${Boolean(config.privateKeyPath)}`);
});

const shutdown = () => {
  console.log('[ota-server] Shutting down...');
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

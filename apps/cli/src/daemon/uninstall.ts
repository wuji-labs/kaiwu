import { logger } from '@/ui/logger';
import { uninstallDaemonService } from './service/installer';

export async function uninstall(): Promise<void> {
  logger.info('Uninstalling Kaiwu background service (automatic startup)...');
  await uninstallDaemonService();
  logger.info('Background service uninstalled');
}

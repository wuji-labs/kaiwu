// @ts-check

import { spawnSync } from '../../lib/portable-child-process.mjs';
import { rm } from 'node:fs/promises';

import { prepareMinisignSecretKeyFile } from './minisign-secret-key.mjs';

export async function maybeSignFile({ path, trustedComment = '' }) {
  const sigPath = `${path}.minisig`;
  const keyRaw = String(process.env.MINISIGN_SECRET_KEY ?? '').trim();
  await rm(sigPath, { force: true });
  if (!keyRaw) return null;

  const preparedKey = await prepareMinisignSecretKeyFile(keyRaw);
  const hasPassphrase = Object.prototype.hasOwnProperty.call(process.env, 'MINISIGN_PASSPHRASE');
  const passphrase = String(process.env.MINISIGN_PASSPHRASE ?? '');
  const keyPath = preparedKey.path;
  const args = ['-S', '-s', keyPath, '-m', path, '-x', sigPath];
  if (trustedComment) {
    args.push('-t', trustedComment);
  }
  try {
    const result = spawnSync('minisign', args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      encoding: 'utf-8',
      input: hasPassphrase ? `${passphrase}\n` : undefined,
    });
    if (result.error) {
      throw new Error(`[release] failed to run minisign: ${result.error.message}`, { cause: result.error });
    }
    if ((result.status ?? 1) !== 0) {
      throw new Error(`[release] minisign exited with status ${result.status ?? 'unknown'}`);
    }
  } finally {
    if (preparedKey.temp) {
      await rm(preparedKey.cleanupPath ?? keyPath, { recursive: true, force: true });
    }
  }
  return sigPath;
}

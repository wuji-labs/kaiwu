// @ts-check

import { lstat, readFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;

async function readVersion(sourceRoot, relativePath) {
  const filePath = join(sourceRoot, relativePath);
  const metadata = await lstat(filePath);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`Authorized version metadata must be a regular file, not a symbolic link: ${relativePath}`);
  }
  if (metadata.size <= 0 || metadata.size > 64 * 1024) {
    throw new Error(`Authorized version metadata size is outside the allowed range: ${relativePath}`);
  }
  const parsed = JSON.parse(await readFile(filePath, 'utf8'));
  const version = String(parsed.version ?? '').trim();
  if (!VERSION.test(version)) throw new Error(`Invalid authorized server version in ${relativePath}`);
  return version;
}

export async function readAuthorizedServerBaseVersion(sourceRoot) {
  const root = resolve(sourceRoot);
  const server = await readVersion(root, 'apps/server/package.json');
  const relay = await readVersion(root, 'packages/relay-server/package.json');
  if (server !== relay) throw new Error(`Authorized server and relay versions must match (${server} != ${relay})`);
  return server;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      'source-dir': { type: 'string' },
      'github-output': { type: 'string' },
    },
    allowPositionals: false,
  });
  const version = await readAuthorizedServerBaseVersion(String(values['source-dir'] ?? ''));
  const output = String(values['github-output'] ?? '').trim();
  if (output) appendFileSync(output, `base_version=${version}\n`, 'utf8');
  else process.stdout.write(`${version}\n`);
}

const isDirectEntry = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectEntry) main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

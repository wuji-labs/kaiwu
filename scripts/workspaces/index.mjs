/**
 * Directory entry for `node --test scripts/workspaces`.
 *
 * Node's test runner only expands directory positionals on some versions; on
 * Node >= 22 a directory argument is loaded as a module, so this entry
 * registers every sibling `*.test.mjs` in place. `node --test
 * scripts/workspaces/*.test.mjs` keeps working unchanged.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(directory)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort();

for (const name of testFiles) {
    await import(pathToFileURL(join(directory, name)).href);
}
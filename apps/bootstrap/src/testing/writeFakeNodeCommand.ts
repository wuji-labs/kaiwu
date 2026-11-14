import { chmodSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/**
 * Writes a Node-backed fake command and returns the path callers should invoke.
 *
 * POSIX: an executable `#!/usr/bin/env node` script at `<dir>/<name>`.
 * Windows: shebangs and exec bits do not exist, and `.cmd` shims cannot forward arbitrary argv
 * faithfully (cmd.exe re-parses quotes/metacharacters such as `|` in `%*`), so the body is written
 * to `<dir>/<name>.cjs`. Bootstrap's command runner launches JavaScript entrypoints with Node, and
 * `withFakeCommandsOnPath` adds `.CJS` to PATHEXT so bare names (`ssh`, `scp`, ...) resolve to it.
 */
export function writeFakeNodeCommand(dir: string, name: string, source: string): string {
    if (process.platform === 'win32') {
        const scriptPath = join(dir, `${name}.cjs`);
        writeFileSync(scriptPath, source, 'utf8');
        return scriptPath;
    }
    const commandPath = join(dir, name);
    writeFileSync(commandPath, `#!/usr/bin/env node\n${source}`, 'utf8');
    chmodSync(commandPath, 0o755);
    return commandPath;
}

/**
 * Prepends `binDir` to PATH (host delimiter) and, on Windows, makes `.CJS` fakes resolvable via
 * PATHEXT. Returns a restore function.
 */
export function patchPathForFakeCommands(binDir: string): () => void {
    const previousPath = process.env.PATH;
    const previousPathext = process.env.PATHEXT;
    process.env.PATH = previousPath ? `${binDir}${delimiter}${previousPath}` : binDir;
    if (process.platform === 'win32') {
        const exts = (previousPathext || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
        process.env.PATHEXT = ['.CJS', ...exts.filter((ext) => ext.toUpperCase() !== '.CJS')].join(';');
    }
    return () => {
        if (previousPath === undefined) delete process.env.PATH;
        else process.env.PATH = previousPath;
        if (previousPathext === undefined) delete process.env.PATHEXT;
        else process.env.PATHEXT = previousPathext;
    };
}

import fs from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ProtectedDirectorySnapshot {
  path: string;
  existed: boolean;
  mtimeMs: number | null;
}

export interface TestHomeDirectoryGuardOptions {
  extraProtectedDirs?: string[];
  isolatedHomeDir?: string;
  enableFsInterception?: boolean;
}

export interface TestHomeDirectoryGuardState {
  isInstalled: boolean;
  isolatedHomeDir: string;
  protectedDirs: string[];
  snapshots: Map<string, ProtectedDirectorySnapshot>;
  originalEnv: {
    HOME?: string;
    USERPROFILE?: string;
    HAPPIER_HOME_DIR?: string;
    KAIWU_HOME_DIR?: string;
  };
}

let initialHomedir = '';
try {
  initialHomedir = homedir();
} catch {
  initialHomedir = '';
}

const initialEnv = {
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  HAPPIER_HOME_DIR: process.env.HAPPIER_HOME_DIR,
  KAIWU_HOME_DIR: process.env.KAIWU_HOME_DIR,
};

function normalizePathForComparison(p: string): string {
  const resolved = resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function resolveRealProtectedHomeDirectories(extraDirs: string[] = []): string[] {
  const dirs = new Set<string>();

  const baseCandidates = [
    initialHomedir,
    initialEnv.USERPROFILE,
    initialEnv.HOME,
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);

  for (const base of baseCandidates) {
    dirs.add(resolve(base, '.kaiwu'));
    dirs.add(resolve(base, '.happier'));
  }

  const normTmp = resolve(tmpdir()).toLowerCase();
  const isInsideTmp = (p: string) => resolve(p).toLowerCase().startsWith(normTmp);

  if (initialEnv.KAIWU_HOME_DIR && initialEnv.KAIWU_HOME_DIR.trim()) {
    const p = resolve(initialEnv.KAIWU_HOME_DIR.trim());
    if (!isInsideTmp(p)) {
      dirs.add(p);
    }
  }
  if (initialEnv.HAPPIER_HOME_DIR && initialEnv.HAPPIER_HOME_DIR.trim()) {
    const p = resolve(initialEnv.HAPPIER_HOME_DIR.trim());
    if (!isInsideTmp(p)) {
      dirs.add(p);
    }
  }

  for (const extra of extraDirs) {
    if (extra && typeof extra === 'string' && extra.trim()) {
      dirs.add(resolve(extra.trim()));
    }
  }

  return Array.from(dirs);
}

function pathToString(pathLike: unknown): string {
  if (!pathLike) return '';
  if (typeof pathLike === 'string') return pathLike;
  if (Buffer.isBuffer(pathLike)) return pathLike.toString('utf8');
  if (pathLike instanceof URL) {
    try {
      return fileURLToPath(pathLike);
    } catch {
      return String(pathLike);
    }
  }
  return String(pathLike);
}

export function findProtectedDirectoryViolation(
  targetPathLike: unknown,
  protectedDirs: readonly string[],
): string | null {
  const targetStr = pathToString(targetPathLike);
  if (!targetStr.trim()) return null;

  const normTarget = normalizePathForComparison(targetStr);

  if (activeGuardState?.isolatedHomeDir) {
    const normIsolated = normalizePathForComparison(activeGuardState.isolatedHomeDir);
    const separator = process.platform === 'win32' ? '\\' : '/';
    const prefixIsolated = normIsolated.endsWith('\\') || normIsolated.endsWith('/')
      ? normIsolated
      : normIsolated + separator;
    if (normTarget === normIsolated || normTarget.startsWith(prefixIsolated)) {
      return null;
    }
  }

  for (const protectedDir of protectedDirs) {
    const normProtected = normalizePathForComparison(protectedDir);
    if (normTarget === normProtected) {
      return protectedDir;
    }
    const separator = process.platform === 'win32' ? '\\' : '/';
    const prefix = normProtected.endsWith('\\') || normProtected.endsWith('/')
      ? normProtected
      : normProtected + separator;
    if (normTarget.startsWith(prefix)) {
      return protectedDir;
    }
  }

  return null;
}

let activeGuardState: TestHomeDirectoryGuardState | null = null;
const originalFsMethods = new Map<string, unknown>();
const originalFsPromisesMethods = new Map<string, unknown>();

export function isTestHomeDirectoryGuardInstalled(): boolean {
  return activeGuardState !== null && activeGuardState.isInstalled;
}

export function getProtectedDirectorySnapshots(): ReadonlyMap<string, ProtectedDirectorySnapshot> {
  return activeGuardState?.snapshots ?? new Map();
}

export function assertRealHomeDirectoriesUnmodified(): void {
  if (!activeGuardState) return;

  for (const [dir, snapshot] of activeGuardState.snapshots.entries()) {
    try {
      const currentStat = fs.statSync(dir);
      if (!snapshot.existed) {
        throw new Error(
          `[GUARD 3 VIOLATION] Protected real home directory was created during test: "${dir}"`,
        );
      }
      if (currentStat.mtimeMs !== snapshot.mtimeMs) {
        throw new Error(
          `[GUARD 3 VIOLATION] Protected real home directory was modified during test (mtime changed): "${dir}" (was ${snapshot.mtimeMs}, now ${currentStat.mtimeMs})`,
        );
      }
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        if (snapshot.existed) {
          throw new Error(
            `[GUARD 3 VIOLATION] Protected real home directory was removed during test: "${dir}"`,
          );
        }
      } else {
        throw err;
      }
    }
  }
}

export function installTestHomeDirectoryGuard(
  options: TestHomeDirectoryGuardOptions = {},
): TestHomeDirectoryGuardState {
  if (activeGuardState?.isInstalled) {
    if (options.extraProtectedDirs?.length) {
      for (const extra of options.extraProtectedDirs) {
        const resolved = resolve(extra);
        if (!activeGuardState.protectedDirs.includes(resolved)) {
          activeGuardState.protectedDirs.push(resolved);
          try {
            const stat = fs.statSync(resolved);
            activeGuardState.snapshots.set(resolved, {
              path: resolved,
              existed: true,
              mtimeMs: stat.mtimeMs,
            });
          } catch {
            activeGuardState.snapshots.set(resolved, {
              path: resolved,
              existed: false,
              mtimeMs: null,
            });
          }
        }
      }
    }
    return activeGuardState;
  }

  const protectedDirs = resolveRealProtectedHomeDirectories(options.extraProtectedDirs ?? []);

  // Isolate environment variables to an isolated temporary directory
  const isolatedHomeDir =
    options.isolatedHomeDir ??
    fs.mkdtempSync(join(tmpdir(), `kaiwu-test-home-${process.pid}-`));
  fs.mkdirSync(isolatedHomeDir, { recursive: true });

  const envBackup = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    HAPPIER_HOME_DIR: process.env.HAPPIER_HOME_DIR,
    KAIWU_HOME_DIR: process.env.KAIWU_HOME_DIR,
  };

  process.env.HOME = isolatedHomeDir;
  process.env.USERPROFILE = isolatedHomeDir;
  process.env.HAPPIER_HOME_DIR = isolatedHomeDir;
  process.env.KAIWU_HOME_DIR = isolatedHomeDir;

  const snapshots = new Map<string, ProtectedDirectorySnapshot>();
  for (const dir of protectedDirs) {
    try {
      const stat = fs.statSync(dir);
      snapshots.set(dir, {
        path: dir,
        existed: true,
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      snapshots.set(dir, {
        path: dir,
        existed: false,
        mtimeMs: null,
      });
    }
  }

  const enableInterception = options.enableFsInterception !== false;
  if (enableInterception) {
    interceptFsMethods(protectedDirs);
  }

  activeGuardState = {
    isInstalled: true,
    isolatedHomeDir,
    protectedDirs,
    snapshots,
    originalEnv: envBackup,
  };

  return activeGuardState;
}

function createViolationError(targetPathLike: unknown, matchedDir: string): Error {
  const pathStr = pathToString(targetPathLike);
  return new Error(
    `[GUARD 3 VIOLATION] Tests are strictly forbidden from writing to real home directories: "${pathStr}" (matched protected directory: "${matchedDir}")`,
  );
}

function interceptFsMethods(protectedDirs: readonly string[]): void {
  function checkPath(pathLike: unknown): void {
    const violation = findProtectedDirectoryViolation(pathLike, protectedDirs);
    if (violation) {
      throw createViolationError(pathLike, violation);
    }
  }

  // Intercept node:fs synchronous methods
  const syncMethods1Arg: Array<keyof typeof fs> = [
    'writeFileSync',
    'appendFileSync',
    'mkdirSync',
    'unlinkSync',
    'rmdirSync',
    'rmSync',
    'truncateSync',
  ];

  for (const method of syncMethods1Arg) {
    const orig = fs[method] as (...args: unknown[]) => unknown;
    if (typeof orig === 'function') {
      originalFsMethods.set(method, orig);
      (fs as any)[method] = function (targetPath: unknown, ...rest: unknown[]) {
        checkPath(targetPath);
        return orig.call(fs, targetPath, ...rest);
      };
    }
  }

  const origCopyFileSync = fs.copyFileSync;
  if (typeof origCopyFileSync === 'function') {
    originalFsMethods.set('copyFileSync', origCopyFileSync);
    fs.copyFileSync = function (src: unknown, dest: unknown, ...rest: unknown[]) {
      checkPath(dest);
      return (origCopyFileSync as any).call(fs, src, dest, ...rest);
    };
  }

  const origRenameSync = fs.renameSync;
  if (typeof origRenameSync === 'function') {
    originalFsMethods.set('renameSync', origRenameSync);
    fs.renameSync = function (oldPath: unknown, newPath: unknown) {
      checkPath(oldPath);
      checkPath(newPath);
      return (origRenameSync as any).call(fs, oldPath, newPath);
    };
  }

  const origLinkSync = fs.linkSync;
  if (typeof origLinkSync === 'function') {
    originalFsMethods.set('linkSync', origLinkSync);
    fs.linkSync = function (existingPath: unknown, newPath: unknown) {
      checkPath(newPath);
      return (origLinkSync as any).call(fs, existingPath, newPath);
    };
  }

  const origSymlinkSync = fs.symlinkSync;
  if (typeof origSymlinkSync === 'function') {
    originalFsMethods.set('symlinkSync', origSymlinkSync);
    fs.symlinkSync = function (target: unknown, linkPath: unknown, ...rest: unknown[]) {
      checkPath(linkPath);
      return (origSymlinkSync as any).call(fs, target, linkPath, ...rest);
    };
  }

  // Intercept node:fs callback methods
  const callbackMethods1Arg: Array<keyof typeof fs> = [
    'writeFile',
    'appendFile',
    'mkdir',
    'unlink',
    'rmdir',
    'rm',
    'truncate',
  ];

  for (const method of callbackMethods1Arg) {
    const orig = fs[method] as (...args: unknown[]) => unknown;
    if (typeof orig === 'function') {
      originalFsMethods.set(method, orig);
      (fs as any)[method] = function (targetPath: unknown, ...rest: unknown[]) {
        const violation = findProtectedDirectoryViolation(targetPath, protectedDirs);
        if (violation) {
          const err = createViolationError(targetPath, violation);
          const lastArg = rest[rest.length - 1];
          if (typeof lastArg === 'function') {
            (lastArg as (err: Error) => void)(err);
            return;
          }
          throw err;
        }
        return orig.call(fs, targetPath, ...rest);
      };
    }
  }

  const origCopyFile = fs.copyFile;
  if (typeof origCopyFile === 'function') {
    originalFsMethods.set('copyFile', origCopyFile);
    (fs as any).copyFile = function (src: unknown, dest: unknown, ...rest: unknown[]) {
      const violation = findProtectedDirectoryViolation(dest, protectedDirs);
      if (violation) {
        const err = createViolationError(dest, violation);
        const lastArg = rest[rest.length - 1];
        if (typeof lastArg === 'function') {
          (lastArg as (err: Error) => void)(err);
          return;
        }
        throw err;
      }
      return (origCopyFile as any).call(fs, src, dest, ...rest);
    };
  }

  const origRename = fs.rename;
  if (typeof origRename === 'function') {
    originalFsMethods.set('rename', origRename);
    (fs as any).rename = function (oldPath: unknown, newPath: unknown, ...rest: unknown[]) {
      const violation =
        findProtectedDirectoryViolation(oldPath, protectedDirs) ??
        findProtectedDirectoryViolation(newPath, protectedDirs);
      if (violation) {
        const err = createViolationError(newPath, violation);
        const lastArg = rest[rest.length - 1];
        if (typeof lastArg === 'function') {
          (lastArg as (err: Error) => void)(err);
          return;
        }
        throw err;
      }
      return (origRename as any).call(fs, oldPath, newPath, ...rest);
    };
  }

  const origLink = fs.link;
  if (typeof origLink === 'function') {
    originalFsMethods.set('link', origLink);
    (fs as any).link = function (existingPath: unknown, newPath: unknown, ...rest: unknown[]) {
      const violation = findProtectedDirectoryViolation(newPath, protectedDirs);
      if (violation) {
        const err = createViolationError(newPath, violation);
        const lastArg = rest[rest.length - 1];
        if (typeof lastArg === 'function') {
          (lastArg as (err: Error) => void)(err);
          return;
        }
        throw err;
      }
      return (origLink as any).call(fs, existingPath, newPath, ...rest);
    };
  }

  const origSymlink = fs.symlink;
  if (typeof origSymlink === 'function') {
    originalFsMethods.set('symlink', origSymlink);
    (fs as any).symlink = function (target: unknown, linkPath: unknown, ...rest: unknown[]) {
      const violation = findProtectedDirectoryViolation(linkPath, protectedDirs);
      if (violation) {
        const err = createViolationError(linkPath, violation);
        const lastArg = rest[rest.length - 1];
        if (typeof lastArg === 'function') {
          (lastArg as (err: Error) => void)(err);
          return;
        }
        throw err;
      }
      return (origSymlink as any).call(fs, target, linkPath, ...rest);
    };
  }

  // Intercept fs.promises methods
  const fsp = fs.promises;
  if (fsp) {
    const promises1Arg: Array<keyof typeof fsp> = [
      'writeFile',
      'appendFile',
      'mkdir',
      'unlink',
      'rmdir',
      'rm',
      'truncate',
    ];

    for (const method of promises1Arg) {
      const orig = fsp[method] as (...args: unknown[]) => Promise<unknown>;
      if (typeof orig === 'function') {
        originalFsPromisesMethods.set(method, orig);
        (fsp as any)[method] = function (targetPath: unknown, ...rest: unknown[]) {
          const violation = findProtectedDirectoryViolation(targetPath, protectedDirs);
          if (violation) {
            return Promise.reject(createViolationError(targetPath, violation));
          }
          return orig.call(fsp, targetPath, ...rest);
        };
      }
    }

    const origPCopyFile = fsp.copyFile;
    if (typeof origPCopyFile === 'function') {
      originalFsPromisesMethods.set('copyFile', origPCopyFile);
      (fsp as any).copyFile = function (src: unknown, dest: unknown, ...rest: unknown[]) {
        const violation = findProtectedDirectoryViolation(dest, protectedDirs);
        if (violation) {
          return Promise.reject(createViolationError(dest, violation));
        }
        return (origPCopyFile as any).call(fsp, src, dest, ...rest);
      };
    }

    const origPRename = fsp.rename;
    if (typeof origPRename === 'function') {
      originalFsPromisesMethods.set('rename', origPRename);
      (fsp as any).rename = function (oldPath: unknown, newPath: unknown) {
        const violation =
          findProtectedDirectoryViolation(oldPath, protectedDirs) ??
          findProtectedDirectoryViolation(newPath, protectedDirs);
        if (violation) {
          return Promise.reject(createViolationError(newPath, violation));
        }
        return (origPRename as any).call(fsp, oldPath, newPath);
      };
    }

    const origPLink = fsp.link;
    if (typeof origPLink === 'function') {
      originalFsPromisesMethods.set('link', origPLink);
      (fsp as any).link = function (existingPath: unknown, newPath: unknown) {
        const violation = findProtectedDirectoryViolation(newPath, protectedDirs);
        if (violation) {
          return Promise.reject(createViolationError(newPath, violation));
        }
        return (origPLink as any).call(fsp, existingPath, newPath);
      };
    }

    const origPSymlink = fsp.symlink;
    if (typeof origPSymlink === 'function') {
      originalFsPromisesMethods.set('symlink', origPSymlink);
      (fsp as any).symlink = function (target: unknown, linkPath: unknown, ...rest: unknown[]) {
        const violation = findProtectedDirectoryViolation(linkPath, protectedDirs);
        if (violation) {
          return Promise.reject(createViolationError(linkPath, violation));
        }
        return (origPSymlink as any).call(fsp, target, linkPath, ...rest);
      };
    }
  }
}

export function uninstallTestHomeDirectoryGuard(): void {
  if (!activeGuardState) return;

  for (const [method, orig] of originalFsMethods.entries()) {
    (fs as any)[method] = orig;
  }
  originalFsMethods.clear();

  const fsp = fs.promises;
  if (fsp) {
    for (const [method, orig] of originalFsPromisesMethods.entries()) {
      (fsp as any)[method] = orig;
    }
    originalFsPromisesMethods.clear();
  }

  // Restore environment variables
  if (activeGuardState.originalEnv.HOME !== undefined) {
    process.env.HOME = activeGuardState.originalEnv.HOME;
  } else {
    delete process.env.HOME;
  }
  if (activeGuardState.originalEnv.USERPROFILE !== undefined) {
    process.env.USERPROFILE = activeGuardState.originalEnv.USERPROFILE;
  } else {
    delete process.env.USERPROFILE;
  }
  if (activeGuardState.originalEnv.HAPPIER_HOME_DIR !== undefined) {
    process.env.HAPPIER_HOME_DIR = activeGuardState.originalEnv.HAPPIER_HOME_DIR;
  } else {
    delete process.env.HAPPIER_HOME_DIR;
  }
  if (activeGuardState.originalEnv.KAIWU_HOME_DIR !== undefined) {
    process.env.KAIWU_HOME_DIR = activeGuardState.originalEnv.KAIWU_HOME_DIR;
  } else {
    delete process.env.KAIWU_HOME_DIR;
  }

  activeGuardState = null;
}

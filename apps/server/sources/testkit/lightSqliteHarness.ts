import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { renderPrismaCompatibleSqliteDatabaseUrl } from "@happier-dev/cli-common/firstPartyRuntime";

import { applyLightDefaultEnv, ensureHandyMasterSecret } from "@/flavors/light/env";
import { resolveLightSqliteDatabaseUrlOptionsFromEnv } from "@/flavors/light/sqliteConnectionConfig";
import { auth } from "@/app/auth/auth";
import { initEncrypt } from "@/modules/encrypt";
import { initFilesLocalFromEnv, loadFiles } from "@/storage/blob/files";
import { db, initDbSqlite, shutdownDbClient } from "@/storage/db";
import { applyEnvValues, restoreEnv as restoreSnapshotEnv, snapshotEnv, type EnvValues } from "./env";

export type LightSqliteHarness = {
    readonly baseDir: string;
    readonly dbPath: string;
    readonly envBase: NodeJS.ProcessEnv;
    restoreEnv: () => void;
    resetEnv: (overrides?: EnvValues) => NodeJS.ProcessEnv;
    resetDbTables: (fns: Array<() => Promise<unknown>>) => Promise<void>;
    close: () => Promise<void>;
};

export type LightSqliteHarnessOptions = Readonly<{
    tempDirPrefix: string;
    tempDirBase?: string;
    initAuth?: boolean;
    initEncrypt?: boolean;
    initFiles?: boolean;
    env?: EnvValues;
}>;

function resolveServerRoot(): string {
    return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function runSqliteMigrations(params: { cwd?: string; env: NodeJS.ProcessEnv }): void {
    const serverRoot = resolveServerRoot();
    const scriptPath = join(serverRoot, "scripts", "migrate.sqlite.deploy.ts");
    const tsxPath = resolve(serverRoot, "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
    const res = spawnSync(
        process.execPath,
        [tsxPath, "--tsconfig", join(serverRoot, "tsconfig.json"), scriptPath],
        {
            cwd: serverRoot,
            env: { ...(params.env as Record<string, string>), RUST_LOG: "info" },
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    if (res.status !== 0) {
        const spawnErr = res.error ? ` Spawn error: ${res.error.message}.` : "";
        const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
        throw new Error(`sqlite migration deploy failed (status=${res.status}).${spawnErr} ${out}`.trim());
    }
}

export async function createLightSqliteHarness(options: LightSqliteHarnessOptions): Promise<LightSqliteHarness> {
    const envBackup = snapshotEnv();
    const tempDirBase = typeof options.tempDirBase === "string" && options.tempDirBase.trim().length > 0
        ? options.tempDirBase
        : tmpdir();
    const baseDir = await mkdtemp(join(tempDirBase, options.tempDirPrefix));
    const dbPath = join(baseDir, "test.sqlite");
    try {
        const envForSqliteOptions = {
            ...process.env,
            ...options.env,
        };
        applyEnvValues({
            KAIWU_DB_PROVIDER: "sqlite",
            HAPPY_DB_PROVIDER: "sqlite",
            KAIWU_SQLITE_MIGRATIONS_DIR: join(resolveServerRoot(), "prisma", "sqlite", "migrations"),
            HAPPIER_SQLITE_MIGRATIONS_DIR: join(resolveServerRoot(), "prisma", "sqlite", "migrations"),
            DATABASE_URL: renderPrismaCompatibleSqliteDatabaseUrl({
                dbPath,
                platform: process.platform,
                sqlite: resolveLightSqliteDatabaseUrlOptionsFromEnv(envForSqliteOptions),
            }),
            HAPPY_SERVER_LIGHT_DATA_DIR: baseDir,
            KAIWU_SERVER_LIGHT_DATA_DIR: baseDir,
            ...options.env,
        });
        applyLightDefaultEnv(process.env);
        await ensureHandyMasterSecret(process.env);
        const envBase = snapshotEnv();

        runSqliteMigrations({ cwd: process.cwd(), env: process.env });
        await initDbSqlite();
        await db.$connect();

        if (options.initAuth) {
            await auth.init();
        }
        if (options.initEncrypt) {
            await initEncrypt();
        }
        if (options.initFiles) {
            initFilesLocalFromEnv(process.env);
            await loadFiles();
        }

        const restoreEnv = () => {
            restoreSnapshotEnv(envBase);
        };

        const resetEnv = (overrides: EnvValues = {}) => {
            restoreEnv();
            applyEnvValues(overrides);
            return snapshotEnv();
        };

        const resetDbTables = async (fns: Array<() => Promise<unknown>>) => {
            for (const fn of fns) {
                await fn().catch(() => {});
            }
        };

        const close = async () => {
            await shutdownDbClient();
            restoreSnapshotEnv(envBackup);
            await rm(baseDir, { recursive: true, force: true });
        };

        return { baseDir, dbPath, envBase, restoreEnv, resetEnv, resetDbTables, close };
    } catch (error) {
        try {
            await shutdownDbClient();
        } catch {
            // ignore cleanup disconnect errors
        }
        restoreSnapshotEnv(envBackup);
        try {
            await rm(baseDir, { recursive: true, force: true });
        } catch {
            // ignore cleanup delete errors
        }
        throw error;
    }
}

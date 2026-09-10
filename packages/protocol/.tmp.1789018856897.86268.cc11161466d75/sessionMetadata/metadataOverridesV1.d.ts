import { z } from 'zod';
import { type CodexBackendMode } from '../providers/codex/backendMode.js';
/**
 * Session metadata override payloads (V1).
 *
 * These are stored inside encrypted `session.metadata` and are shared across UI/CLI.
 * Keep schemas permissive (passthrough) for forward compatibility.
 *
 * NOTE: Use the `create*Schema` factory forms for repos that may have multiple Zod
 * instances (nohoist); callers should pass their local `z` import.
 */
export declare function createModelOverrideV1Schema(zod: typeof z): any;
export declare const ModelOverrideV1Schema: any;
export type ModelOverrideV1 = z.infer<typeof ModelOverrideV1Schema>;
export declare function buildModelOverrideV1(params: Readonly<{
    updatedAt: number;
    modelId: string;
}>): ModelOverrideV1;
export declare function createAcpSessionModeOverrideV1Schema(zod: typeof z): any;
export declare const AcpSessionModeOverrideV1Schema: any;
export type AcpSessionModeOverrideV1 = z.infer<typeof AcpSessionModeOverrideV1Schema>;
export declare function buildAcpSessionModeOverrideV1(params: Readonly<{
    updatedAt: number;
    modeId: string;
}>): AcpSessionModeOverrideV1;
export declare function createAcpConfigOptionOverridesV1Schema(zod: typeof z): any;
export declare const AcpConfigOptionOverridesV1Schema: any;
export type AcpConfigOptionOverridesV1 = z.infer<typeof AcpConfigOptionOverridesV1Schema>;
export declare function buildAcpConfigOptionOverridesV1(params: Readonly<{
    updatedAt: number;
    overrides: Record<string, {
        updatedAt: number;
        value: string | number | boolean | null;
    }>;
}>): AcpConfigOptionOverridesV1;
export declare function createCodexRuntimeDescriptorV1Schema(zod: typeof z): any;
export declare const CodexRuntimeDescriptorV1Schema: any;
export type CodexRuntimeDescriptorV1 = z.infer<typeof CodexRuntimeDescriptorV1Schema>;
export declare function buildCodexRuntimeDescriptorV1(params: Readonly<{
    backendMode: CodexBackendMode;
}>): CodexRuntimeDescriptorV1;
export declare function readCodexRuntimeDescriptorV1BackendMode(value: unknown): CodexBackendMode | null;
//# sourceMappingURL=metadataOverridesV1.d.ts.map
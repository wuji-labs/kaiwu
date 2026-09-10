import { z } from 'zod';
export const MachineFileBrowserRootSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    path: z.string().min(1),
}).passthrough();
export const MachineFileBrowserDirectoryEntrySchema = z.object({
    name: z.string().min(1),
    path: z.string().min(1),
    type: z.enum(['file', 'directory', 'other']),
    size: z.number().int().nonnegative().optional(),
    modified: z.number().int().nonnegative().optional(),
}).passthrough();
export const DaemonFilesystemListRootsResponseSchema = z.discriminatedUnion('ok', [
    z.object({
        ok: z.literal(true),
        roots: z.array(MachineFileBrowserRootSchema),
    }).passthrough(),
    z.object({
        ok: z.literal(false),
        error: z.string().min(1),
        errorCode: z.string().min(1).optional(),
    }).passthrough(),
]);
export const DaemonFilesystemListDirectoryRequestSchema = z.object({
    path: z.string().min(1),
    includeFiles: z.boolean().optional(),
    maxEntries: z.number().int().positive().nullable().optional(),
}).passthrough();
export const DaemonFilesystemListDirectoryResponseSchema = z.discriminatedUnion('ok', [
    z.object({
        ok: z.literal(true),
        path: z.string().min(1),
        entries: z.array(MachineFileBrowserDirectoryEntrySchema),
        truncated: z.boolean(),
    }).passthrough(),
    z.object({
        ok: z.literal(false),
        error: z.string().min(1),
        errorCode: z.string().min(1).optional(),
    }).passthrough(),
]);
//# sourceMappingURL=machineFileBrowser.js.map
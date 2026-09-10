import { z } from 'zod';
export const ChangeKindSchema = z.enum([
    'account',
    'automation',
    'artifact',
    'feed',
    'friends',
    'friend_request',
    'friend_accepted',
    'kv',
    'machine',
    'pet',
    'session',
    'share',
]);
export const ChangeEntrySchema = z.object({
    cursor: z.number().int().min(0),
    kind: z.string().trim().min(1),
    entityId: z.string(),
    changedAt: z.number().int().min(0),
    hint: z.unknown().nullable().optional(),
}).strict();
export const ChangesResponseSchema = z.object({
    changes: z.array(ChangeEntrySchema),
    nextCursor: z.number().int().min(0),
}).strict();
export const CurrentCursorResponseSchema = z.object({
    cursor: z.number().int().min(0),
    changesFloor: z.number().int().min(0),
}).strict();
export const CursorGoneErrorSchema = z.object({
    error: z.literal('cursor-gone'),
    currentCursor: z.number().int().min(0),
}).strict();
//# sourceMappingURL=changes.js.map
import { z } from 'zod';
import { SessionSummaryShardV1Schema } from '../../structuredMessages/sessionSummaryShardV1.js';
import { SessionSynopsisV1Schema } from '../../structuredMessages/sessionSynopsisV1.js';
import { MemorySessionSystemRecordKindSchema } from './memorySystemRecordKinds.js';
export const MemorySummaryShardSystemRecordPayloadSchema = z
    .object({
    kind: z.literal('summary_shard.v1'),
    payload: SessionSummaryShardV1Schema,
})
    .passthrough();
export const MemorySynopsisSystemRecordPayloadSchema = z
    .object({
    kind: z.literal('synopsis.v1'),
    payload: SessionSynopsisV1Schema,
})
    .passthrough();
export const MemorySessionSystemRecordPayloadSchema = z.discriminatedUnion('kind', [
    MemorySummaryShardSystemRecordPayloadSchema,
    MemorySynopsisSystemRecordPayloadSchema,
]);
export const MemorySessionSystemRecordRawPayloadSchema = z.union([
    SessionSummaryShardV1Schema,
    SessionSynopsisV1Schema,
]);
export function isMemorySessionSystemRecordKind(value) {
    return MemorySessionSystemRecordKindSchema.safeParse(value).success;
}
//# sourceMappingURL=memorySystemRecordPayload.js.map
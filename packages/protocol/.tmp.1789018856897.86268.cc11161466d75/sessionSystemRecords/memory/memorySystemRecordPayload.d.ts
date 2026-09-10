import { z } from 'zod';
import { MemorySessionSystemRecordKindSchema } from './memorySystemRecordKinds.js';
export declare const MemorySummaryShardSystemRecordPayloadSchema: any;
export type MemorySummaryShardSystemRecordPayload = z.infer<typeof MemorySummaryShardSystemRecordPayloadSchema>;
export declare const MemorySynopsisSystemRecordPayloadSchema: any;
export type MemorySynopsisSystemRecordPayload = z.infer<typeof MemorySynopsisSystemRecordPayloadSchema>;
export declare const MemorySessionSystemRecordPayloadSchema: any;
export type MemorySessionSystemRecordPayload = z.infer<typeof MemorySessionSystemRecordPayloadSchema>;
export declare const MemorySessionSystemRecordRawPayloadSchema: any;
export type MemorySessionSystemRecordRawPayload = z.infer<typeof MemorySessionSystemRecordRawPayloadSchema>;
export declare function isMemorySessionSystemRecordKind(value: string): value is z.infer<typeof MemorySessionSystemRecordKindSchema>;
//# sourceMappingURL=memorySystemRecordPayload.d.ts.map
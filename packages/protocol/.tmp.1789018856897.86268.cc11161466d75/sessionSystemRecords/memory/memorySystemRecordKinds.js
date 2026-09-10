import { z } from 'zod';
export const SESSION_SYSTEM_RECORD_MEMORY_NAMESPACE = 'memory';
export const MEMORY_SESSION_SYSTEM_RECORD_KINDS = [
    'summary_shard.v1',
    'synopsis.v1',
];
export const MemorySessionSystemRecordKindSchema = z.enum(MEMORY_SESSION_SYSTEM_RECORD_KINDS);
//# sourceMappingURL=memorySystemRecordKinds.js.map
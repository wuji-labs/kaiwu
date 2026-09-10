import { z } from 'zod';
export declare const SESSION_SYSTEM_RECORD_MEMORY_NAMESPACE: "memory";
export declare const MEMORY_SESSION_SYSTEM_RECORD_KINDS: readonly ["summary_shard.v1", "synopsis.v1"];
export declare const MemorySessionSystemRecordKindSchema: any;
export type MemorySessionSystemRecordKind = z.infer<typeof MemorySessionSystemRecordKindSchema>;
//# sourceMappingURL=memorySystemRecordKinds.d.ts.map
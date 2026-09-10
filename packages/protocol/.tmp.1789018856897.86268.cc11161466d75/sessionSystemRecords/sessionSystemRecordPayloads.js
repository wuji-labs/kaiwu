import { z } from 'zod';
import { ActivitySessionSystemRecordRawPayloadSchema, } from './activity/activitySystemRecordPayload.js';
import { MemorySessionSystemRecordRawPayloadSchema, } from './memory/memorySystemRecordPayload.js';
export const SessionSystemRecordPayloadSchema = z.union([
    MemorySessionSystemRecordRawPayloadSchema,
    ActivitySessionSystemRecordRawPayloadSchema,
]);
//# sourceMappingURL=sessionSystemRecordPayloads.js.map
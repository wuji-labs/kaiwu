import { z } from 'zod';
import { SESSION_SYSTEM_RECORD_ACTIVITY_NAMESPACE } from './activity/activitySystemRecordKinds.js';
import { SESSION_SYSTEM_RECORD_MEMORY_NAMESPACE } from './memory/memorySystemRecordKinds.js';
export const SESSION_SYSTEM_RECORD_NAMESPACES = [
    SESSION_SYSTEM_RECORD_MEMORY_NAMESPACE,
    SESSION_SYSTEM_RECORD_ACTIVITY_NAMESPACE,
];
export const SessionSystemRecordNamespaceSchema = z.enum(SESSION_SYSTEM_RECORD_NAMESPACES);
//# sourceMappingURL=sessionSystemRecordNamespace.js.map
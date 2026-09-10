import { z } from 'zod';
import { ActivitySessionSystemRecordKindSchema } from './activitySystemRecordKinds.js';
export declare const ActivityWorkflowRunSystemRecordPayloadSchema: any;
export type ActivityWorkflowRunSystemRecordPayload = z.infer<typeof ActivityWorkflowRunSystemRecordPayloadSchema>;
export declare const ActivityBackgroundTaskSystemRecordPayloadSchema: any;
export type ActivityBackgroundTaskSystemRecordPayload = z.infer<typeof ActivityBackgroundTaskSystemRecordPayloadSchema>;
export declare const ActivitySessionSystemRecordPayloadSchema: any;
export type ActivitySessionSystemRecordPayload = z.infer<typeof ActivitySessionSystemRecordPayloadSchema>;
export declare const ActivitySessionSystemRecordRawPayloadSchema: any;
export type ActivitySessionSystemRecordRawPayload = z.infer<typeof ActivitySessionSystemRecordRawPayloadSchema>;
export declare function isActivitySessionSystemRecordKind(value: string): value is z.infer<typeof ActivitySessionSystemRecordKindSchema>;
//# sourceMappingURL=activitySystemRecordPayload.d.ts.map
import { z } from 'zod';
export declare const SESSION_RUNTIME_ACTIVITY_SNAPSHOT_EVENT = "session-runtime-activity-snapshot";
export declare const SESSION_RUNTIME_ACTIVITY_CLOSE_EVENT = "session-runtime-activity-close";
export declare const SESSION_PUBLISHER_LEGACY_ALIVE_EVENT = "session-alive";
export declare const SESSION_PUBLISHER_LEGACY_END_EVENT = "session-end";
/** Released stable/preview CLI reachability vector, retained only at the machine-bound socket seam. */
export declare const SessionPublisherLegacyAliveSchema: any;
/** Released stable/preview CLI clean-end vector, retained only at the machine-bound socket seam. */
export declare const SessionPublisherLegacyEndSchema: any;
export type SessionPublisherLegacyAlive = z.infer<typeof SessionPublisherLegacyAliveSchema>;
export type SessionPublisherLegacyEnd = z.infer<typeof SessionPublisherLegacyEndSchema>;
export declare const SessionRuntimeActivitySnapshotRequestSchema: any;
export declare const SessionRuntimeActivitySnapshotAckSchema: any;
export type SessionRuntimeActivitySnapshotRequest = z.infer<typeof SessionRuntimeActivitySnapshotRequestSchema>;
export type SessionRuntimeActivitySnapshotAck = z.infer<typeof SessionRuntimeActivitySnapshotAckSchema>;
export declare const SessionRuntimeActivityCloseRequestSchema: any;
export declare const SessionRuntimeActivityCloseAckSchema: any;
export type SessionRuntimeActivityCloseRequest = z.infer<typeof SessionRuntimeActivityCloseRequestSchema>;
export type SessionRuntimeActivityCloseAck = z.infer<typeof SessionRuntimeActivityCloseAckSchema>;
//# sourceMappingURL=transport.d.ts.map
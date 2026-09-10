import type { ConnectedServiceAuthGroupMemberStateV1 } from './connectedServiceSchemas.js';
export type ConnectedServiceManualActiveProfileRuntimeBlocker = Readonly<{
    resetAtMs?: number;
}>;
export declare function readConnectedServiceManualActiveProfileRuntimeBlocker(state: ConnectedServiceAuthGroupMemberStateV1, nowMs: number): ConnectedServiceManualActiveProfileRuntimeBlocker | null;
export declare function clearConnectedServiceAuthGroupMemberRuntimeBlockers(state: ConnectedServiceAuthGroupMemberStateV1): ConnectedServiceAuthGroupMemberStateV1;
//# sourceMappingURL=connectedServiceAuthGroupMemberRuntimeStatePolicy.d.ts.map
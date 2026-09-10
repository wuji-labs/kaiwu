import type { SessionRuntimeActivityProjection } from './projection.js';
export type RuntimeIdleAdmission = Readonly<{
    decision: 'allow';
    revision: number;
}> | Readonly<{
    decision: 'defer';
    reason: 'active' | 'unknown';
    revision: number;
}>;
export declare function decideRuntimeIdleAdmission(projection: SessionRuntimeActivityProjection): RuntimeIdleAdmission;
//# sourceMappingURL=admission.d.ts.map
import type { SessionWorkflowRunSnapshotV1 } from './sessionWorkflowRunSnapshotV1.js';
export declare const SESSION_WORKFLOW_RUN_RECORD_REVISION_PATTERN: RegExp;
/**
 * `recordRevision` is a per-run, strictly monotonic decimal string. It is produced only by the
 * activity publisher after a material durable-record change. It must NOT be derived from
 * wall-clock time, headline metadata, `metadataVersion`, or UI fetch state.
 *
 * @param previous the previous committed revision (or undefined for a run's first publication)
 * @param materialChange whether the normalized snapshot materially changed vs the previous one
 */
export declare function bumpWorkflowRunRecordRevision(previous: string | undefined, materialChange: boolean): string;
/**
 * Decide whether two normalized run snapshots differ materially per the W1 material-change
 * table. Display-ordering timestamps (`updatedAt` at run and agent level) and the bookkeeping
 * `recordRevision` are NOT material; everything else — status, ids, titles, source revision,
 * phases (order/title/membership), agent fields, aggregate counts, and lifecycle timestamps —
 * is material.
 */
export declare function isWorkflowRunSnapshotMaterialChange(previous: SessionWorkflowRunSnapshotV1 | undefined, next: SessionWorkflowRunSnapshotV1): boolean;
//# sourceMappingURL=sessionWorkflowRunRecordRevision.d.ts.map
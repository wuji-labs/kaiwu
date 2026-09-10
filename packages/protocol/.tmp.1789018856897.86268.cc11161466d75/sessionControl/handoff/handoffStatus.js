import { z } from 'zod';
import { SessionHandoffRecoveryActionSchema, SessionHandoffTransportStrategySchema, } from './handoffTypes.js';
const MAX_HANDOFF_ID_LENGTH = 256;
const MAX_JOB_ID_LENGTH = 256;
const MAX_PATH_LENGTH = 4096;
const MAX_DIGEST_LENGTH = 256;
const MAX_PHASE_DETAIL_LENGTH = 1024;
const MAX_PROGRESS_WARNINGS = 50;
const MAX_RECOVERY_ACTIONS = 50;
export const SessionHandoffPhaseSchema = z.enum([
    'preparing',
    'negotiating_transport',
    'staging_target',
    'cutover',
    'transferring',
    'importing',
    'resuming',
    'finalizing',
]);
export const SessionHandoffStatusCodeSchema = z.enum([
    'pending',
    'ready_for_cutover',
    'in_progress',
    'awaiting_recovery',
    'completed',
    'aborted',
    'failed',
]);
export const SessionHandoffProgressCheckpointSchema = z.enum([
    'scan_source',
    'plan',
    'transfer_blobs',
    'stage_target',
    'apply',
    'import_session',
    'finalize',
]);
export const SESSION_HANDOFF_PROGRESS_FULL_TIMELINE = [
    'plan',
    'transfer_blobs',
    'stage_target',
    'apply',
    'import_session',
    'finalize',
];
export const SESSION_HANDOFF_PROGRESS_FULL_TIMELINE_WITH_SOURCE_SCAN = [
    'scan_source',
    ...SESSION_HANDOFF_PROGRESS_FULL_TIMELINE,
];
export const SESSION_HANDOFF_PROGRESS_MINIMAL_TIMELINE = [
    'stage_target',
    'import_session',
    'finalize',
];
export function resolveSessionHandoffProgressTimeline(checkpoint) {
    if (!checkpoint) {
        return SESSION_HANDOFF_PROGRESS_MINIMAL_TIMELINE;
    }
    if (checkpoint === 'scan_source') {
        return SESSION_HANDOFF_PROGRESS_FULL_TIMELINE_WITH_SOURCE_SCAN;
    }
    return checkpoint === 'plan' || checkpoint === 'transfer_blobs' || checkpoint === 'apply' || checkpoint === 'finalize'
        ? SESSION_HANDOFF_PROGRESS_FULL_TIMELINE
        : SESSION_HANDOFF_PROGRESS_MINIMAL_TIMELINE;
}
export const SessionHandoffProgressWarningCodeSchema = z.enum([
    'blocking_divergence_detected',
    'problematic_source_entries',
    'resumed_existing_job',
]);
const SessionHandoffProgressCountsSchema = z
    .object({
    files: z.number().int().min(0).optional(),
    bytes: z.number().int().min(0).optional(),
})
    .strict();
export const SessionHandoffProgressSchema = z
    .object({
    updatedAtMs: z.number().int().min(0),
    checkpoint: SessionHandoffProgressCheckpointSchema,
    planned: z.object({
        totalFiles: z.number().int().min(0).optional(),
        totalBytes: z.number().int().min(0).optional(),
        added: z.number().int().min(0).optional(),
        changed: z.number().int().min(0).optional(),
        removed: z.number().int().min(0).optional(),
    }).strict(),
    transferred: z.object({
        files: z.number().int().min(0).optional(),
        bytes: z.number().int().min(0).optional(),
        blobs: z.number().int().min(0).optional(),
    }).strict(),
    applied: SessionHandoffProgressCountsSchema.optional(),
    remaining: SessionHandoffProgressCountsSchema.optional(),
    current: z.object({
        relativePath: z.string().min(1).max(MAX_PATH_LENGTH).optional(),
        digest: z.string().min(1).max(MAX_DIGEST_LENGTH).optional(),
        phaseDetail: z.string().min(1).max(MAX_PHASE_DETAIL_LENGTH).optional(),
    }).strict().optional(),
    resumable: z.boolean(),
    warnings: z.array(SessionHandoffProgressWarningCodeSchema).max(MAX_PROGRESS_WARNINGS).readonly().optional(),
})
    .strict();
export const SessionHandoffWorkspacePreflightSummarySchema = z
    .object({
    addedPathsCount: z.number().int().min(0),
    changedPathsCount: z.number().int().min(0),
    removedPathsCount: z.number().int().min(0),
    totalBytes: z.number().int().min(0).optional(),
})
    .strict();
export const SessionHandoffStatusSchema = z
    .object({
    handoffId: z.string().min(1).max(MAX_HANDOFF_ID_LENGTH),
    status: SessionHandoffStatusCodeSchema,
    phase: SessionHandoffPhaseSchema,
    jobId: z.string().min(1).max(MAX_JOB_ID_LENGTH).optional(),
    progress: SessionHandoffProgressSchema.optional(),
    workspacePreflightSummary: SessionHandoffWorkspacePreflightSummarySchema.optional(),
    transportStrategy: SessionHandoffTransportStrategySchema.nullable().optional(),
    recoveryActions: z
        .array(SessionHandoffRecoveryActionSchema)
        .max(MAX_RECOVERY_ACTIONS)
        .readonly()
        .default(() => []),
})
    .strict();
//# sourceMappingURL=handoffStatus.js.map
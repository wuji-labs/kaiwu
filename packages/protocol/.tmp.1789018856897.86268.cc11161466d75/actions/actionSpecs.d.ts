import { z } from 'zod';
import { type ActionId } from './actionIds.js';
import { type ActionUiPlacement } from './actionUiPlacements.js';
import { type ActionOperationDeclarationV1 } from './operations/actionOperationDeclarationV1.js';
export { ActionApprovalFlowSchema, ActionApprovalResultSchema, ActionApprovalSchema, resolveActionApprovalFlow, type ActionApproval, type ActionApprovalFlow, type ActionApprovalResult, } from './actionApprovalMetadata.js';
export { ActionOperationDeclarationV1Schema, type ActionOperationDeclarationV1, } from './operations/actionOperationDeclarationV1.js';
export declare const ActionSurfaceSchema: any;
export type ActionSurfaces = z.infer<typeof ActionSurfaceSchema>;
export declare const ActionToolExposureModeSchema: any;
export type ActionToolExposureMode = z.infer<typeof ActionToolExposureModeSchema>;
export declare const ActionToolExposureSurfaceSchema: any;
export type ActionToolExposureSurface = z.infer<typeof ActionToolExposureSurfaceSchema>;
export declare const ActionToolExposureSchema: any;
export type ActionToolExposure = z.infer<typeof ActionToolExposureSchema>;
export declare const ActionContextualDefaultSourceSchema: any;
export type ActionContextualDefaultSource = z.infer<typeof ActionContextualDefaultSourceSchema>;
export declare const ActionContextualDefaultsSchema: any;
export type ActionContextualDefaults = z.infer<typeof ActionContextualDefaultsSchema>;
export declare const ActionSafetySchema: any;
export type ActionSafety = z.infer<typeof ActionSafetySchema>;
export declare const ActionInputWidgetSchema: any;
export type ActionInputWidget = z.infer<typeof ActionInputWidgetSchema>;
export declare const ActionInputOptionSchema: any;
export type ActionInputOption = z.infer<typeof ActionInputOptionSchema>;
export declare const ActionInputFieldHintSchema: any;
export type ActionInputFieldHint = z.infer<typeof ActionInputFieldHintSchema>;
export declare const ActionInputHintsSchema: any;
export type ActionInputHints = z.infer<typeof ActionInputHintsSchema>;
export declare const ActionPromptingSchema: any;
export type ActionPrompting = z.infer<typeof ActionPromptingSchema>;
export declare const ActionSpecSchema: any;
export type ActionSpec = z.infer<typeof ActionSpecSchema> & Readonly<{
    placements: readonly ActionUiPlacement[];
    operation?: ActionOperationDeclarationV1;
}>;
export declare const SessionTranscriptGetInputSchema: any;
export type SessionTranscriptGetInput = z.infer<typeof SessionTranscriptGetInputSchema>;
export type SessionTranscriptGetItem = Readonly<{
    id: string;
    seq?: number;
    createdAt: number;
    role: 'user' | 'assistant' | 'tool' | 'event' | 'reasoning' | 'unknown';
    kind: string;
    text?: string;
    summary?: string;
    toolName?: string;
    callId?: string;
    raw?: unknown;
    truncated?: boolean;
    rawTruncated?: boolean;
}>;
export type SessionTranscriptGetOutput = Readonly<{
    ok: true;
    sessionId: string;
    items: readonly SessionTranscriptGetItem[];
    nextCursor: string | null;
    hasMore: boolean;
    diagnostics?: Readonly<{
        rawRowsScanned: number;
        pagesFetched: number;
        scanLimitReached: boolean;
    }>;
}> | Readonly<{
    ok: false;
    errorCode: string;
    errorMessage: string;
    candidates?: readonly string[];
}>;
export declare const SessionEventsGetInputSchema: any;
export type SessionEventsGetInput = z.infer<typeof SessionEventsGetInputSchema>;
export type SessionEventsGetItem = Readonly<{
    id: string;
    seq?: number;
    createdAt: number;
    storedMessageRole?: 'user' | 'agent' | 'event' | 'unknown';
    semanticRole: 'user' | 'assistant' | 'tool' | 'event' | 'reasoning' | 'unknown';
    kind: string;
    provider?: string;
    text?: string;
    summary?: string;
    toolName?: string;
    callId?: string;
    raw?: unknown;
    truncated?: boolean;
    rawTruncated?: boolean;
}>;
export type SessionEventsGetOutput = Readonly<{
    ok: true;
    sessionId: string;
    items: readonly SessionEventsGetItem[];
    nextCursor: string | null;
    hasMore: boolean;
    diagnostics?: Readonly<{
        rawRowsScanned: number;
        pagesFetched: number;
        scanLimitReached: boolean;
        payloadTruncations: number;
    }>;
}> | Readonly<{
    ok: false;
    errorCode: string;
    errorMessage: string;
    candidates?: readonly string[];
}>;
/**
 * Action-facing fork recipe. The transport's parent session id is resolved from
 * the action input/context, while legacy callers may continue to omit a fork
 * point and let their host adapter apply its existing default.
 */
export declare const SessionForkActionInputSchema: any;
export type SessionForkActionInput = z.infer<typeof SessionForkActionInputSchema>;
export declare const SessionSpawnNewInputSchema: any;
export type SessionSpawnNewInput = z.infer<typeof SessionSpawnNewInputSchema>;
export declare const ACTION_SPECS: readonly ActionSpec[];
export declare function listActionSpecs(): readonly ActionSpec[];
export declare function getActionSpec(id: ActionId): ActionSpec;
export declare function isActionSpecSurfacedOn(spec: ActionSpec, surface: keyof ActionSurfaces | null | undefined): boolean;
export declare function listActionSpecsForSurface(surface: keyof ActionSurfaces): readonly ActionSpec[];
export declare function listVoiceToolActionSpecs(): readonly ActionSpec[];
export declare function isVoicePromptHotPathSpec(spec: ActionSpec): boolean;
export declare function listVoicePromptHotPathSpecs(): readonly ActionSpec[];
export declare function listVoiceActionBlockSpecs(): readonly ActionSpec[];
export declare function listVoiceClientToolNames(): readonly string[];
export declare function resolveVoiceClientToolNameAlias(value: string): string | null;
//# sourceMappingURL=actionSpecs.d.ts.map
import type { SessionRollbackTarget } from './sessionRollback.js';
export type CompletedConversationTurn = Readonly<{
    userMessageSeq: number;
    startSeqInclusive: number;
    endSeqInclusive: number;
}>;
export type SessionRollbackPlan = Readonly<{
    numTurns: number;
    targetUserMessageSeq: number;
    range: Readonly<{
        startSeqInclusive: number;
        endSeqInclusive: number;
    }>;
}>;
export declare function resolveSessionRollbackPlan(params: Readonly<{
    target: SessionRollbackTarget;
    completedTurns: readonly CompletedConversationTurn[];
}>): SessionRollbackPlan | null;
//# sourceMappingURL=sessionRollbackPlanning.d.ts.map
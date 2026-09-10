import { z } from 'zod';
export declare const STRUCTURED_QUESTION_LIMITS: Readonly<{
    maxQuestions: 16;
    maxOptionsPerQuestion: 128;
    maxAnswersPerQuestion: 32;
    maxStringLength: 16384;
    maxTotalStringLength: 262144;
    maxLegacyDecodeStates: 4096;
}>;
export type AskUserQuestionToolName = 'AskUserQuestion' | 'ask_user_question';
export declare function isAskUserQuestionToolName(value: unknown): value is AskUserQuestionToolName;
export type StructuredQuestionOptionAnswerLike = string | Readonly<{
    value?: unknown;
    choice?: unknown;
    label?: unknown;
}>;
/**
 * Resolves the exact value sent back to a question producer. Labels remain presentation
 * text; a producer may provide a distinct value or choice identifier for its wire reply.
 */
export declare function resolveStructuredQuestionOptionAnswerValue(option: unknown): string | null;
export type StructuredQuestionLike = Readonly<{
    id?: unknown;
    question?: unknown;
    header?: unknown;
    multiSelect?: unknown;
    multiple?: unknown;
    options?: unknown;
    freeform?: unknown;
}>;
export type StructuredQuestionDescriptorOption = Readonly<{
    label: string;
    answerValue: string;
    value?: string;
    choice?: string;
    description?: string;
}>;
export type StructuredQuestionDescriptor = Readonly<{
    id?: string;
    question?: string;
    header?: string;
    responseKey: string;
    keys: readonly string[];
    options: readonly StructuredQuestionDescriptorOption[];
    multiSelect: boolean;
    freeform?: Readonly<{
        placeholder?: string;
        description?: string;
        initialValue?: string;
        multiline?: boolean;
        allowEmpty?: boolean;
    }>;
    allowsFreeform: boolean;
}>;
export type NormalizeStructuredQuestionDescriptorsResult = Readonly<{
    ok: true;
    questions: readonly StructuredQuestionDescriptor[];
}> | Readonly<{
    ok: false;
}>;
/**
 * Canonical grammar and projection for published AskUserQuestion descriptors.
 * Unknown provider fields deliberately remain outside this projection so the
 * publication boundary can preserve them in its detached source snapshot.
 */
export declare function normalizeStructuredQuestionDescriptors(input: unknown): NormalizeStructuredQuestionDescriptorsResult;
export declare const StructuredQuestionAnswersV1Schema: any;
export type StructuredQuestionAnswersV1 = Readonly<Record<string, ReadonlyArray<string>>>;
export type BuiltAskUserQuestionAnswerPayload = Readonly<{
    kind: 'modern';
    send: Readonly<{
        protocol: 'structured-question-v1';
        structuredAnswersV1: StructuredQuestionAnswersV1;
    }>;
}> | Readonly<{
    kind: 'legacy';
    send: Readonly<{
        protocol: 'legacy-permission';
        answers: Readonly<Record<string, string>>;
    }>;
}> | Readonly<{
    kind: 'requires_cli_update';
    unsafeQuestionKeys: ReadonlyArray<string>;
}>;
export type SendableAskUserQuestionAnswerPayload = Extract<BuiltAskUserQuestionAnswerPayload, {
    kind: 'modern' | 'legacy';
}>['send'];
export declare const StructuredQuestionResponseV1Schema: any;
export type StructuredQuestionResponseV1 = z.infer<typeof StructuredQuestionResponseV1Schema>;
/**
 * Builds the deployed comma-delimited permission payload only when its historical parser
 * reconstructs the exact canonical arrays. A null result means the caller must not downgrade.
 */
export declare function buildLegacyStructuredQuestionAnswers(answers: StructuredQuestionAnswersV1): Readonly<Record<string, string>> | null;
export declare function buildStructuredQuestionAnswerPayload(answers: StructuredQuestionAnswersV1, structuredQuestionAnswersV1Supported: boolean): BuiltAskUserQuestionAnswerPayload;
//# sourceMappingURL=structuredQuestionAnswersV1.d.ts.map
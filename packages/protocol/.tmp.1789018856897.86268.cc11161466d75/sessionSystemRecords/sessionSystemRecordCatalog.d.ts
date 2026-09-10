import { z } from 'zod';
export type SessionSystemRecordKindDefinition = Readonly<{
    payloadSchema: z.ZodType<unknown>;
}>;
export type SessionSystemRecordNamespaceDefinition = Readonly<{
    kinds: Readonly<Record<string, SessionSystemRecordKindDefinition>>;
}>;
export type SessionSystemRecordCatalog = Readonly<Record<string, SessionSystemRecordNamespaceDefinition>>;
export declare const SESSION_SYSTEM_RECORD_CATALOG: {
    readonly memory: {
        readonly kinds: {
            readonly 'summary_shard.v1': {
                readonly payloadSchema: any;
            };
            readonly 'synopsis.v1': {
                readonly payloadSchema: any;
            };
        };
    };
    readonly activity: {
        readonly kinds: {
            readonly 'workflow_run.v1': {
                readonly payloadSchema: any;
            };
            readonly 'background_task.v1': {
                readonly payloadSchema: any;
            };
        };
    };
};
export declare function isRegisteredSessionSystemRecordKind(namespace: string, kind: string): boolean;
export declare function addRegisteredSessionSystemRecordKindIssue(value: {
    namespace: string;
    kind: string;
}, ctx: z.RefinementCtx): void;
export declare function addSessionSystemRecordPlainContentPayloadIssue(value: {
    namespace: string;
    kind: string;
    content?: unknown;
}, ctx: z.RefinementCtx): void;
export declare function getSessionSystemRecordPayloadSchema(namespace: string, kind: string): z.ZodType<unknown> | null;
//# sourceMappingURL=sessionSystemRecordCatalog.d.ts.map
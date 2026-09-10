import { z, type output as ZodOutput, type ZodTypeAny } from 'zod';
import type { SessionAuthoringFieldDefinitionMap } from './fieldDefinition.js';
type SessionAuthoringFieldShape<TDefinitions extends SessionAuthoringFieldDefinitionMap> = {
    [TKey in keyof TDefinitions]: TDefinitions[TKey]['schema'];
};
type SessionAuthoringFieldDefaults<TDefinitions extends SessionAuthoringFieldDefinitionMap> = Partial<{
    [TKey in keyof TDefinitions]: ZodOutput<TDefinitions[TKey]['schema']>;
}>;
type SyncedSessionAuthoringFieldKey<TDefinitions extends SessionAuthoringFieldDefinitionMap> = {
    [TKey in keyof TDefinitions]: TDefinitions[TKey]['draftStorage'] extends 'sync' ? TKey : never;
}[keyof TDefinitions];
type SyncedSessionAuthoringFieldShape<TDefinitions extends SessionAuthoringFieldDefinitionMap> = {
    [TKey in SyncedSessionAuthoringFieldKey<TDefinitions>]: TDefinitions[TKey] extends {
        draftSchema: infer TDraftSchema extends ZodTypeAny;
    } ? TDraftSchema : TDefinitions[TKey]['schema'];
};
export type SessionAuthoringFieldArtifacts<TDefinitions extends SessionAuthoringFieldDefinitionMap> = Readonly<{
    definitions: TDefinitions;
    shape: SessionAuthoringFieldShape<TDefinitions>;
    valueSchema: z.ZodObject<SessionAuthoringFieldShape<TDefinitions>>;
    defaults: SessionAuthoringFieldDefaults<TDefinitions>;
    syncedFieldIds: ReadonlyArray<SyncedSessionAuthoringFieldKey<TDefinitions>>;
    syncedShape: SyncedSessionAuthoringFieldShape<TDefinitions>;
    syncedValueSchema: z.ZodObject<SyncedSessionAuthoringFieldShape<TDefinitions>>;
}>;
export declare function buildSessionAuthoringFieldArtifacts<TDefinitions extends SessionAuthoringFieldDefinitionMap>(definitions: TDefinitions): SessionAuthoringFieldArtifacts<TDefinitions>;
export {};
//# sourceMappingURL=buildFieldArtifacts.d.ts.map
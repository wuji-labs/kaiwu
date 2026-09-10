import type { output as ZodOutput } from 'zod';
import type { SettingDefinitionMap } from './settingDefinition.js';
type SettingShape<TDefinitions extends SettingDefinitionMap> = {
    [TKey in keyof TDefinitions]: TDefinitions[TKey]['schema'];
};
type SettingDefaults<TDefinitions extends SettingDefinitionMap> = {
    [TKey in keyof TDefinitions]: ZodOutput<TDefinitions[TKey]['schema']>;
};
type TrackedSettingDefinitions<TDefinitions extends SettingDefinitionMap> = Partial<TDefinitions>;
export type SettingArtifacts<TDefinitions extends SettingDefinitionMap> = Readonly<{
    definitions: TDefinitions;
    shape: SettingShape<TDefinitions>;
    defaults: SettingDefaults<TDefinitions>;
    trackedCurrentStateDefinitions: TrackedSettingDefinitions<TDefinitions>;
    trackedChangeDefinitions: TrackedSettingDefinitions<TDefinitions>;
    trackedDerivedDefinitions: TrackedSettingDefinitions<TDefinitions>;
}>;
export declare function buildSettingArtifacts<TDefinitions extends SettingDefinitionMap>(definitions: TDefinitions): SettingArtifacts<TDefinitions>;
export {};
//# sourceMappingURL=buildSettingArtifacts.d.ts.map
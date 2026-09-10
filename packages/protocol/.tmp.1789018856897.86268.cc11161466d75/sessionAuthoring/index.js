import { z } from 'zod';
import { buildSessionAuthoringFieldArtifacts } from './buildFieldArtifacts.js';
import { SESSION_AUTHORING_CONTEXT_KINDS } from './contextKinds.js';
import { SESSION_AUTHORING_FIELD_CATALOG, } from './fieldCatalog.js';
export { SESSION_AUTHORING_CONTEXT_KINDS, } from './contextKinds.js';
export { defineSessionAuthoringFields, } from './fieldDefinition.js';
export { buildSessionAuthoringFieldArtifacts, } from './buildFieldArtifacts.js';
export { SESSION_AUTHORING_FIELD_CATALOG, SessionAuthoringAutomationV1Schema, SessionAuthoringCheckoutCreationDraftV1Schema, SessionAuthoringCodexBackendModeSchema, SessionAuthoringTerminalV1Schema, SyncedSessionAuthoringTerminalV1Schema, SyncedSessionAuthoringConnectedServicesV1Schema, } from './fieldCatalog.js';
const SESSION_AUTHORING_FIELD_ARTIFACTS = buildSessionAuthoringFieldArtifacts(SESSION_AUTHORING_FIELD_CATALOG);
export const SESSION_AUTHORING_FIELD_IDS = Object.freeze(Object.keys(SESSION_AUTHORING_FIELD_ARTIFACTS.definitions));
export const SESSION_AUTHORING_FIELD_DESCRIPTORS = SESSION_AUTHORING_FIELD_ARTIFACTS.definitions;
export const SessionAuthoringValueV1Schema = SESSION_AUTHORING_FIELD_ARTIFACTS.valueSchema;
export const SYNCED_SESSION_AUTHORING_FIELD_IDS_V1 = Object.freeze(SESSION_AUTHORING_FIELD_ARTIFACTS.syncedFieldIds);
export const SyncedSessionAuthoringFieldIdV1Schema = z.enum(SYNCED_SESSION_AUTHORING_FIELD_IDS_V1);
export const SyncedSessionAuthoringValueV1Schema = SESSION_AUTHORING_FIELD_ARTIFACTS.syncedValueSchema;
if (SESSION_AUTHORING_CONTEXT_KINDS.length < 1 || SESSION_AUTHORING_FIELD_IDS.length < 1) {
    throw new Error('sessionAuthoring catalogs must not be empty');
}
//# sourceMappingURL=index.js.map
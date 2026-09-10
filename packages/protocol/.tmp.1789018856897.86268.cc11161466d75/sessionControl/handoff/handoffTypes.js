import { z } from 'zod';
import { DirectSessionsSourceSchema } from '../../directSessions/daemonRpcV1.js';
import { AgentRuntimeDescriptorV1Schema } from '../../sessionMetadata/agentRuntimeDescriptorV1.js';
import { CODEX_BACKEND_MODES } from '../../providers/codex/backendMode.js';
export const SessionHandoffStorageModeSchema = z.enum(['direct', 'persisted']);
export const SessionHandoffTransportStrategySchema = z.enum(['direct_peer', 'server_routed_stream']);
export const SessionHandoffConflictPolicySchema = z.enum(['create_sibling_copy', 'replace_existing']);
export const SessionHandoffWorkspaceTransferStrategySchema = z.enum(['transfer_snapshot', 'sync_changes']);
export const SessionHandoffRecoveryActionSchema = z.enum(['restart_on_source', 'retry_target_cleanup', 'keep_stopped']);
export const SessionHandoffCodexBackendModeSchema = z.enum(CODEX_BACKEND_MODES);
export const SessionHandoffCodexAffinitySchema = z.object({
    backendMode: SessionHandoffCodexBackendModeSchema.nullable(),
    source: DirectSessionsSourceSchema.optional(),
    runtimeDescriptor: AgentRuntimeDescriptorV1Schema.optional(),
}).strict();
//# sourceMappingURL=handoffTypes.js.map
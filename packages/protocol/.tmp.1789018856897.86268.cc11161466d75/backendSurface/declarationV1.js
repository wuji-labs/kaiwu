import { z } from 'zod';
export const AttachSurfaceStaticMetadataV1Schema = z.object({
    attachStrategy: z.enum(['terminal_host', 'provider_attach', 'remote_display']),
    topology: z.enum(['exclusive', 'shared']),
    locality: z.enum(['same_machine', 'session_machine', 'network_reachable']).optional(),
    maxClients: z.number().int().positive().nullable().optional(),
    requiresLocalAttachmentInfo: z.boolean().optional(),
    liveProbe: z.enum(['none', 'optional', 'required']).optional(),
}).strict();
export const BackendSurfaceDeclarationV1Schema = z.object({
    attach: AttachSurfaceStaticMetadataV1Schema.nullable().optional(),
}).strict();
//# sourceMappingURL=declarationV1.js.map
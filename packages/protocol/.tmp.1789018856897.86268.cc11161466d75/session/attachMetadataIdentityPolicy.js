import { z } from 'zod';
export const SESSION_ATTACH_METADATA_IDENTITY_POLICIES = [
    'preserve_current_identity',
    'replace_with_runtime_identity',
];
export const SessionAttachMetadataIdentityPolicySchema = z.enum(SESSION_ATTACH_METADATA_IDENTITY_POLICIES);
//# sourceMappingURL=attachMetadataIdentityPolicy.js.map
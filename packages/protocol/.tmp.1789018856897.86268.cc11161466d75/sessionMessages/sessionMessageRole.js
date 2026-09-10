import { z } from 'zod';
export const SESSION_MESSAGE_ROLES = ['user', 'agent', 'event', 'unknown'];
export const SessionMessageRoleSchema = z.enum(SESSION_MESSAGE_ROLES);
//# sourceMappingURL=sessionMessageRole.js.map
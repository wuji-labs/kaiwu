import { z } from 'zod';
export declare const DEFAULT_SESSION_MESSAGES_CAPABILITIES: Readonly<{
    role: false;
    /**
     * Turn projection on the message listing: one row per prompt plus the LAST reply of that
     * turn. Defaults to false so a server that predates it is never sent `projection=turns` —
     * an unknown query parameter is ignored rather than rejected, and the client would then be
     * handed the ordinary listing while believing it asked for the projection.
     */
    turns: false;
}>;
export declare const SessionMessagesCapabilitiesSchema: any;
export type SessionMessagesCapabilities = z.infer<typeof SessionMessagesCapabilitiesSchema>;
export declare const SessionRuntimeActivityCapabilitiesSchema: any;
export declare const SessionPendingInputCapabilitiesSchema: any;
export type SessionRuntimeActivityCapabilities = z.infer<typeof SessionRuntimeActivityCapabilitiesSchema>;
export type SessionPendingInputCapabilities = z.infer<typeof SessionPendingInputCapabilitiesSchema>;
export declare const DEFAULT_SESSION_CAPABILITIES: Readonly<{
    messages: Readonly<{
        role: false;
        /**
         * Turn projection on the message listing: one row per prompt plus the LAST reply of that
         * turn. Defaults to false so a server that predates it is never sent `projection=turns` —
         * an unknown query parameter is ignored rather than rejected, and the client would then be
         * handed the ordinary listing while believing it asked for the projection.
         */
        turns: false;
    }>;
}>;
export declare const SessionCapabilitiesSchema: any;
export type SessionCapabilities = z.infer<typeof SessionCapabilitiesSchema>;
//# sourceMappingURL=sessionCapabilities.d.ts.map
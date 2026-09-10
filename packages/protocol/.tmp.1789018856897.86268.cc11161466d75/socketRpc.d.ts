import { z } from 'zod';
import type { SocketRpcAuthorizationContext } from './rpc.js';
export declare const SOCKET_RPC_EVENTS: {
    readonly REGISTER: "rpc-register";
    readonly REGISTERED: "rpc-registered";
    readonly UNREGISTER: "rpc-unregister";
    readonly UNREGISTERED: "rpc-unregistered";
    readonly ERROR: "rpc-error";
    readonly CALL: "rpc-call";
    readonly REQUEST: "rpc-request";
    readonly MACHINE_TRANSFER_ENVELOPE: "machine-transfer-envelope";
};
export type SocketRpcEvent = (typeof SOCKET_RPC_EVENTS)[keyof typeof SOCKET_RPC_EVENTS];
export type SocketRpcRequestPayload = Readonly<{
    method: string;
    params: unknown;
    authorization?: SocketRpcAuthorizationContext;
    transportResponseEnvelopeVersion?: 1;
}>;
export declare const SOCKET_RPC_TRANSPORT_RESPONSE_ENVELOPE_VERSION_V1: 1;
export declare const SocketRpcTransportAcknowledgementV1Schema: any;
export type SocketRpcTransportAcknowledgementV1 = z.infer<typeof SocketRpcTransportAcknowledgementV1Schema>;
export declare const SocketRpcTransportResponseEnvelopeV1Schema: any;
export type SocketRpcTransportResponseEnvelopeV1 = z.infer<typeof SocketRpcTransportResponseEnvelopeV1Schema>;
export type SocketRpcTargetFailureV1 = Readonly<{
    type: 'socket-rpc-target-failure-v1';
    errorCode: string;
    error: string;
}>;
//# sourceMappingURL=socketRpc.d.ts.map
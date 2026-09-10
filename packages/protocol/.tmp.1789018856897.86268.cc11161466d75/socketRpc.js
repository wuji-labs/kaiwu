import { z } from 'zod';
export const SOCKET_RPC_EVENTS = {
    REGISTER: 'rpc-register',
    REGISTERED: 'rpc-registered',
    UNREGISTER: 'rpc-unregister',
    UNREGISTERED: 'rpc-unregistered',
    ERROR: 'rpc-error',
    CALL: 'rpc-call',
    REQUEST: 'rpc-request',
    MACHINE_TRANSFER_ENVELOPE: 'machine-transfer-envelope',
};
export const SOCKET_RPC_TRANSPORT_RESPONSE_ENVELOPE_VERSION_V1 = 1;
export const SocketRpcTransportAcknowledgementV1Schema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('session.stop'),
        status: z.literal('stopped'),
    }).strict(),
]);
export const SocketRpcTransportResponseEnvelopeV1Schema = z.object({
    v: z.literal(SOCKET_RPC_TRANSPORT_RESPONSE_ENVELOPE_VERSION_V1),
    result: z.unknown(),
    acknowledgement: SocketRpcTransportAcknowledgementV1Schema.optional(),
}).strict().refine((value) => Object.prototype.hasOwnProperty.call(value, 'result'), { path: ['result'], message: 'result is required' });
//# sourceMappingURL=socketRpc.js.map
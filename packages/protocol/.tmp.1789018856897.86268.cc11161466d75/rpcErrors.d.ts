import type { RpcErrorCode } from './rpc.js';
import type { SocketRpcTargetFailureV1 } from './socketRpc.js';
export type RpcErrorCarrier = {
    rpcErrorCode?: RpcErrorCode | string;
    message?: string;
};
export declare class RpcError extends Error {
    readonly rpcErrorCode: RpcErrorCode | string;
    constructor(message: string, rpcErrorCode: RpcErrorCode | string);
}
export declare const PUBLIC_RPC_HANDLER_ERROR_CODES: {
    readonly STRUCTURED_QUESTION_INVALID: "STRUCTURED_QUESTION_INVALID";
    readonly STRUCTURED_QUESTION_LEGACY_INVALID: "STRUCTURED_QUESTION_LEGACY_INVALID";
    readonly STRUCTURED_QUESTION_LEGACY_AMBIGUOUS: "STRUCTURED_QUESTION_LEGACY_AMBIGUOUS";
    readonly STRUCTURED_QUESTION_RECEIVER_NOT_OWNER: "STRUCTURED_QUESTION_RECEIVER_NOT_OWNER";
};
export type PublicRpcHandlerErrorCode = (typeof PUBLIC_RPC_HANDLER_ERROR_CODES)[keyof typeof PUBLIC_RPC_HANDLER_ERROR_CODES];
export declare class PublicRpcHandlerError extends RpcError {
    readonly publicErrorCode: PublicRpcHandlerErrorCode;
    constructor(publicErrorCode: PublicRpcHandlerErrorCode, privateMessage?: string);
}
export declare function isPublicRpcHandlerError(error: unknown): error is PublicRpcHandlerError;
export declare function toSocketRpcTargetFailureV1(error: PublicRpcHandlerError): SocketRpcTargetFailureV1;
export declare function isSocketRpcTargetFailureV1(value: unknown): value is SocketRpcTargetFailureV1;
export declare function isRpcError(error: unknown): error is RpcError;
export declare function createRpcCallError(opts: {
    error: string;
    errorCode?: string | null | undefined;
}): Error;
export declare function readRpcErrorCode(error: unknown): string | undefined;
export declare function isRpcMethodNotAvailableError(error: unknown): boolean;
export declare function isRpcMethodNotFoundError(error: unknown): boolean;
export declare function isRpcSessionMachineControlUnavailableError(error: unknown): boolean;
//# sourceMappingURL=rpcErrors.d.ts.map
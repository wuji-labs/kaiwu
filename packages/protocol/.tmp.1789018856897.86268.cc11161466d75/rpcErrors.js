import { RPC_ERROR_CODES } from './rpc.js';
export class RpcError extends Error {
    rpcErrorCode;
    constructor(message, rpcErrorCode) {
        super(message);
        this.name = 'RpcError';
        this.rpcErrorCode = rpcErrorCode;
    }
}
export const PUBLIC_RPC_HANDLER_ERROR_CODES = {
    STRUCTURED_QUESTION_INVALID: 'STRUCTURED_QUESTION_INVALID',
    STRUCTURED_QUESTION_LEGACY_INVALID: 'STRUCTURED_QUESTION_LEGACY_INVALID',
    STRUCTURED_QUESTION_LEGACY_AMBIGUOUS: 'STRUCTURED_QUESTION_LEGACY_AMBIGUOUS',
    STRUCTURED_QUESTION_RECEIVER_NOT_OWNER: 'STRUCTURED_QUESTION_RECEIVER_NOT_OWNER',
};
const PUBLIC_RPC_HANDLER_ERROR_GUIDANCE = 'This answer could not be handled safely. Update or reconnect Kaiwu, then try again.';
const PUBLIC_RPC_HANDLER_ERROR_CODE_SET = new Set(Object.values(PUBLIC_RPC_HANDLER_ERROR_CODES));
export class PublicRpcHandlerError extends RpcError {
    publicErrorCode;
    constructor(publicErrorCode, privateMessage = PUBLIC_RPC_HANDLER_ERROR_GUIDANCE) {
        super(privateMessage, publicErrorCode);
        this.name = 'PublicRpcHandlerError';
        this.publicErrorCode = publicErrorCode;
    }
}
export function isPublicRpcHandlerError(error) {
    if (!error || typeof error !== 'object')
        return false;
    const candidate = error;
    return candidate.name === 'PublicRpcHandlerError'
        && typeof candidate.publicErrorCode === 'string'
        && PUBLIC_RPC_HANDLER_ERROR_CODE_SET.has(candidate.publicErrorCode);
}
export function toSocketRpcTargetFailureV1(error) {
    return Object.freeze({
        type: 'socket-rpc-target-failure-v1',
        errorCode: error.publicErrorCode,
        error: PUBLIC_RPC_HANDLER_ERROR_GUIDANCE,
    });
}
export function isSocketRpcTargetFailureV1(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const candidate = value;
    return Object.keys(candidate).length === 3
        && candidate.type === 'socket-rpc-target-failure-v1'
        && typeof candidate.errorCode === 'string'
        && PUBLIC_RPC_HANDLER_ERROR_CODE_SET.has(candidate.errorCode)
        && candidate.error === PUBLIC_RPC_HANDLER_ERROR_GUIDANCE;
}
export function isRpcError(error) {
    if (!error || typeof error !== 'object')
        return false;
    if (error instanceof RpcError)
        return true;
    if (!(error instanceof Error))
        return false;
    const carrier = error;
    return carrier.name === 'RpcError' && typeof carrier.rpcErrorCode === 'string' && carrier.rpcErrorCode.trim().length > 0;
}
export function createRpcCallError(opts) {
    if (typeof opts.errorCode === 'string' && opts.errorCode.length > 0) {
        return new RpcError(opts.error, opts.errorCode);
    }
    return new Error(opts.error);
}
export function readRpcErrorCode(error) {
    if (!error || typeof error !== 'object')
        return undefined;
    const carrier = error;
    return typeof carrier.rpcErrorCode === 'string' ? carrier.rpcErrorCode : undefined;
}
export function isRpcMethodNotAvailableError(error) {
    const code = readRpcErrorCode(error);
    return code === RPC_ERROR_CODES.METHOD_NOT_AVAILABLE;
}
export function isRpcMethodNotFoundError(error) {
    const code = readRpcErrorCode(error);
    return code === RPC_ERROR_CODES.METHOD_NOT_FOUND;
}
export function isRpcSessionMachineControlUnavailableError(error) {
    return readRpcErrorCode(error) === RPC_ERROR_CODES.SESSION_MACHINE_CONTROL_UNAVAILABLE;
}
//# sourceMappingURL=rpcErrors.js.map
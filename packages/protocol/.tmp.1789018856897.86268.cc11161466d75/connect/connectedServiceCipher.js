import { openAccountScopedBlobCiphertext, sealAccountScopedBlobCiphertext, } from '../crypto/accountScopedCipher.js';
export function sealConnectedServiceCredentialCiphertext(params) {
    return sealAccountScopedBlobCiphertext({
        kind: 'connected_service_credential',
        material: params.material,
        payload: params.payload,
        randomBytes: params.randomBytes,
    });
}
export function openConnectedServiceCredentialCiphertext(params) {
    return openAccountScopedBlobCiphertext({
        kind: 'connected_service_credential',
        material: params.material,
        ciphertext: params.ciphertext,
    });
}
export function openConnectedServiceQuotaSnapshotCiphertext(params) {
    return openAccountScopedBlobCiphertext({
        kind: 'connected_service_quota_snapshot',
        material: params.material,
        ciphertext: params.ciphertext,
    });
}
//# sourceMappingURL=connectedServiceCipher.js.map
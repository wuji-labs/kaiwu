export function resolveStoredContentKindForSessionEncryptionMode(mode) {
    return mode === 'plain' ? 'plain' : 'encrypted';
}
export function resolveEffectiveDefaultAccountEncryptionMode(storagePolicy, configuredDefaultMode) {
    if (storagePolicy === 'required_e2ee')
        return 'e2ee';
    if (storagePolicy === 'plaintext_only')
        return 'plain';
    return configuredDefaultMode;
}
export function isSessionEncryptionModeAllowedByStoragePolicy(storagePolicy, mode) {
    if (storagePolicy === 'required_e2ee')
        return mode === 'e2ee';
    if (storagePolicy === 'plaintext_only')
        return mode === 'plain';
    return true;
}
export function isStoredContentKindAllowedForSessionByStoragePolicy(storagePolicy, sessionEncryptionMode, contentKind) {
    if (storagePolicy === 'required_e2ee') {
        return sessionEncryptionMode === 'e2ee' && contentKind === 'encrypted';
    }
    if (storagePolicy === 'plaintext_only') {
        return sessionEncryptionMode === 'plain' && contentKind === 'plain';
    }
    const expected = resolveStoredContentKindForSessionEncryptionMode(sessionEncryptionMode);
    return contentKind === expected;
}
//# sourceMappingURL=storagePolicyDecisions.js.map
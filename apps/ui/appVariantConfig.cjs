const path = require('node:path');

// Keep this module dependency-free so it can run in GitHub Actions before `yarn install`.
// We load the canonical release ring catalog from the checked-in CJS entrypoint.
const releaseRings = require(path.resolve(__dirname, '..', '..', 'packages', 'release-runtime', 'releaseRings.cjs'));
const { getReleaseRingCatalogEntry, normalizeReleaseRingId } = releaseRings;

function resolveLogicalVariantFromRing(ring) {
    if (ring.expoAppEnv === 'production') return 'production';
    if (ring.expoAppEnv === 'development') return 'development';
    return 'preview';
}

function buildRingBackedConfig(ringId, overrides) {
    const ring = getReleaseRingCatalogEntry(ringId);
    return {
        id: ringId,
        logicalVariant: resolveLogicalVariantFromRing(ring),
        name: overrides.name,
        webTitle: overrides.webTitle || overrides.name,
        iosBundleId: overrides.iosBundleId,
        androidPackage: overrides.androidPackage,
        scheme: ring.appScheme,
        updatesChannel: ring.expoUpdatesChannel,
        featurePolicyEnv: ring.embeddedPolicyEnv,
        enableAssociatedDomains: overrides.enableAssociatedDomains,
    };
}

function buildProductionConfig(overrides) {
    const ring = getReleaseRingCatalogEntry('stable');
    return {
        id: 'production',
        logicalVariant: 'production',
        name: overrides.name,
        webTitle: overrides.webTitle || overrides.name,
        iosBundleId: overrides.iosBundleId,
        androidPackage: overrides.androidPackage,
        scheme: overrides.scheme || ['kaiwu', 'happier'],
        updatesChannel: ring.expoUpdatesChannel,
        featurePolicyEnv: ring.embeddedPolicyEnv,
        enableAssociatedDomains: overrides.enableAssociatedDomains,
    };
}

const APP_ENVIRONMENT_CONFIGS = {
    internaldev: buildRingBackedConfig('internaldev', {
        name: '无极开物 (internal dev)',
        iosBundleId: 'com.wujilabs.kaiwu.dev.internal',
        androidPackage: 'com.wujilabs.kaiwu.internaldev',
        enableAssociatedDomains: false,
    }),
    internalpreview: buildRingBackedConfig('internalpreview', {
        name: '无极开物 (internal preview)',
        iosBundleId: 'com.wujilabs.kaiwu.internalpreview',
        androidPackage: 'com.wujilabs.kaiwu.internalpreview',
        enableAssociatedDomains: false,
    }),
    publicdev: buildRingBackedConfig('publicdev', {
        name: '无极开物 (dev)',
        iosBundleId: 'com.wujilabs.kaiwu.publicdev',
        androidPackage: 'com.wujilabs.kaiwu.publicdev',
        enableAssociatedDomains: false,
    }),
    preview: buildRingBackedConfig('preview', {
        name: '无极开物 (preview)',
        iosBundleId: 'com.wujilabs.kaiwu.preview',
        androidPackage: 'com.wujilabs.kaiwu.preview',
        enableAssociatedDomains: false,
    }),
    production: buildProductionConfig({
        name: '无极开物',
        webTitle: '无极开物',
        iosBundleId: 'com.wujilabs.kaiwu',
        androidPackage: 'com.wujilabs.kaiwu',
        enableAssociatedDomains: true,
    }),
};

function normalizeAppEnvironmentId(raw) {
    const value = String(raw ?? '').trim().toLowerCase();
    if (!value) return '';
    if (Object.prototype.hasOwnProperty.call(APP_ENVIRONMENT_CONFIGS, value)) {
        return value;
    }

    const ring = normalizeReleaseRingId(value);
    if (!ring) return '';
    return ring === 'stable' ? 'production' : ring;
}

function getAppEnvironmentConfig(raw) {
    const candidate = raw !== undefined && raw !== null && String(raw).trim() !== ''
        ? raw
        : (process.env.APP_VARIANT || process.env.APP_ENV || '');
    const normalized = normalizeAppEnvironmentId(candidate) || 'production';
    return APP_ENVIRONMENT_CONFIGS[normalized];
}

module.exports = {
    APP_ENVIRONMENT_CONFIGS,
    getAppEnvironmentConfig,
    normalizeAppEnvironmentId,
};

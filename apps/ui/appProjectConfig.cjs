// Keep the Expo project identity dependency-free so trusted recovery jobs can
// submit already-built artifacts without installing the application workspace.
const EXPO_PROJECT_CONFIG = Object.freeze({
    owner: 'wujilabs',
    slug: 'kaiwu',
    easProjectId: 'fe8b4c48-acd5-40c8-8682-06e285dc28b5',
});

module.exports = { EXPO_PROJECT_CONFIG };

// Keep the Expo project identity dependency-free so trusted recovery jobs can
// submit already-built artifacts without installing the application workspace.
const EXPO_PROJECT_CONFIG = Object.freeze({
    owner: 'wuji-labs', // TODO(待确认): 我方 Expo 账号注册后核对
    slug: 'kaiwu',
    easProjectId: '2a550bd7-e4d2-4f59-ab47-dcb778775cee', // TODO: 我方 Expo 项目创建后替换
});

module.exports = { EXPO_PROJECT_CONFIG };

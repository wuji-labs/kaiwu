# Google Services JSON - TODO

## 说明

`google-services.json` 文件必须从我方 Firebase 项目重新下载。当前文件是上游项目的配置，不能直接使用。

## 替换步骤

1. 在 Firebase Console 中创建或选择我方项目
2. 添加 Android 应用，Bundle ID 为 `com.wujilabs.kaiwu`
3. 从 Firebase Console 下载 `google-services.json` 文件
4. 替换本仓库中的 `google-services.json` 文件
5. 确保 build.gradle 中 Firebase 插件配置正确

## 变体包名

需要为以下变体创建对应的 Firebase 应用：
- `com.wujilabs.kaiwu` (production)
- `com.wujilabs.kaiwu.preview` (preview)
- `com.wujilabs.kaiwu.publicdev` (public dev)
- `com.wujilabs.kaiwu.internalpreview` (internal preview)
- `com.wujilabs.kaiwu.internaldev` (internal dev)

## 更多信息

- [Firebase Android 文档](https://firebase.google.com/docs/android/setup)

# Kaiwu（无极开物）· 学脉与来源

## 上游项目

本仓库为 **active product fork**，上游项目为：

https://github.com/happier-dev/happier

我们不是 parked vendor clone，而是在建立和运营独立生产服务的活跃产品开发分支。

## 建仓基线

- **建仓日期**：2026-09-05
- **基线 commit**：186afd5f4280309aec59f7521e822644d3523c62
- **基线 tag 描述**：cli-dev-92-g186afd5f42

## 重要声明

本仓是 active product fork，不是 parked vendor clone。
2026-06-27 的项目清理曾以「没有 active product task」为由删除前身
D:\Projects\happy-app 与 D:\Projects\qianyuan-happier，
本仓有在运行的生产服务（https://kaiwu.chengqiyun.com）与在建交付物，不得按 vendor parking 政策清理。

## 母体复用

本仓依赖乾元無極集团母体的共享基础设施，包括：

- 法务框架与合规
- 文档与内容标准
- 浏览器与会话管理
- 身份与权限系统
- 网络与路由配置
- OCR 与文件处理
- AI 基础设施与模型出口

这些设施均复用 D:\Projects\qianyuan-wuji，依照 D:\Projects\qianyuan-wuji\docs\governance\split-repo-foundation.md 进行管理。

## 生产环境

本仓的运行时环境包括：

- **自建服务容器**：wuji-kaiwu-server
- **公开入口**：https://kaiwu.chengqiyun.com
- **主机**：腾讯云 Lighthouse (150.158.55.6)
- **入口配置**：Caddy 反代至宿主机服务

生产部署与运维由集团统一治理，不独立管理。

## 命名规范

- **产品正式名**：`无极开物`（中文）/ `Kaiwu`（英文）
- **出品署名**：`WUJI-Labs`，保留连字符（标注于关于页）
- **代码标识符**一律去连字符：Android `applicationId` 与 iOS Bundle ID 均为 `com.wujilabs.kaiwu`
  （Android 包名走 Java 包名规则，连字符是非法字符，会直接编译失败，故双端统一取无连字符形式）。
- **Expo slug**：`kaiwu`；**仓目录**：`wuji-labs-app`（保留不改）。
- **深链域名**：`kaiwu.chengqiyun.com`
- **后端 API 域名**：`kaiwu.chengqiyun.com`

## 与上游的关系

本仓是 happier-dev/happier 的下游独立演进分支，定位同 happier 之于 happy —— 是二次开发与持续迭代，不是换皮。
上游 LICENSE 与版权声明一律保留；产品面不展示上游血缘；许可合规见 LICENSE 与 docs 法律区。

# 开物发版手册（网页 / CLI / iOS）

适用于在 WUJI 工作站（Windows）上发布开物。机器门禁一律使用 `scripts/release-critical-tests.mjs`，不许手工拼装构建。

## 0. 前置
- **在 PowerShell 下构建**。Git Bash 里的 `node` 指向 `D:\hongmengvscode\软件\node.exe`，会让 `build-cli-binaries` 失败。
- 在**主工作区** `D:\Projects\kaiwu` 构建和发布。合同 worktree 的 `node_modules` 是连接点，Metro 和打包脚本会把依赖解析错。
- 协议包的编译产物可能过期，发布前先执行 `yarn --cwd packages/protocol build`。
- 本机自带的 Windows OpenSSH 在缺少 `ProgramData` 环境变量时会以 255 静默退出（0.2.23 起开物会话会放行该变量）。如果仍然失败，就用 Git 的 ssh：
  `$env:KAIWU_DEPLOY_SSH_BIN='C:\Program Files\Git\usr\bin\ssh.exe'; $env:KAIWU_DEPLOY_SCP_BIN='C:\Program Files\Git\usr\bin\scp.exe'`

## 1. 网页版
```powershell
node scripts/release-web.mjs
```
依次执行：门禁、`expo export`、上传 COS 并校验、备份服务器后原地覆盖（`index.html` 最后替换）、无头浏览器检查线上页面。输出里会给出回滚命令。

## 2. CLI（Windows 包 + npm 包）
1. 改版本号：`apps/cli/package.json` 和 `scripts/upload-release-to-cos.py` 里的 `version`，然后提交。
2. 构建：
   ```powershell
   node scripts/pipeline/release/build-cli-binaries.mjs --channel production --version <X> --targets windows-x64
   cd apps/cli; npm pack --pack-destination <临时目录>   # 产物改名为 dist/release-assets/cli/kaiwu-cli-<X>.tgz
   ```
3. **上传前先核对包内容**：解开 `kaiwu-v<X>-windows-x64.tar.gz`，确认 `package-dist/.build-manifest.json` 里的 `buildVersion` 正确，并在打包后的代码里 grep 出本次改动的特征字符串。
4. 手写 `dist/release-assets/cli/latest.json`（`version`、`tgz`、`windows_x64` 以及两个 sha256），先备份旧文件。
5. 把 `apps/website/public/install.ps1` / `install.sh` 里的兜底版本（`DEFAULT_VERSION` 和 sha256）改成新版本，然后提交。
6. `python scripts/upload-release-to-cos.py`：上传产物、`latest.json` 和安装脚本，并逐个校验。
7. 清理旧版本：`python scripts/cos-prune-releases.py --apply`（见第 4 节）。

**安装到本机**：`pwsh -File apps/website/public/install.ps1`。安装脚本会先把被后台服务锁住的 `kaiwu.exe` 改名挪开，robocopy 的重试次数也有上限。随后用 `kaiwu service restart`（0.2.22 起会确认守护进程已起来且版本一致，否则自动回滚服务脚本）。
- 重启会结束开物后台及其会话进程树。如果要从开物会话里触发重启，必须把重启脚本放到会话进程树**之外**运行（例如用 `Win32_Process.Create` 启动），否则脚本会和会话一起被结束。

**成员机**：`/tmp/kaiwu-upgrade.ps1` 经 SSH 逐个账户升级（`wujilabs1`、`wujilabs2`）。它只换程序文件；各账户的后台服务在该账户下次登录或执行 `kaiwu service restart` 后才换成新版。

## 3. iOS（未签名 IPA）
```powershell
gh workflow run build-ios-unsigned.yml --ref wuji/main
gh run watch <id> --exit-status; gh run download <id> -D dist/ios/<版本>
```
- **不能用 COS 默认域名分发 IPA/APK**（COS 会返回 `DownloadForbidden`）。IPA 放到服务器 `/opt/wuji-kaiwu/docs/html/releases/mobile/kaiwu.ipa`，经 `https://kaiwu.chengqiyun.com/download/ios` 下载（Caddy `chengqiyun-caddy-1` 里配置的 302 跳转）。APK 同理：`/download/android`。
- 修改 Caddyfile 前先备份，然后在 `chengqiyun-caddy-1` 里依次执行 `caddy validate` 和 `caddy reload`。**注意**：`huaxu-baoguang-web-1` 也用 Caddy 镜像，按镜像名匹配容器会选错。

## 4. COS 旧包清理
- 规则：只保留最新 2 个版本。`latest.json` 指向的版本和安装脚本里的兜底版本永远不删。
- 手动执行：`python scripts/cos-prune-releases.py`（默认只列出将删除的内容），加 `--apply` 才真正删除。
- 定期执行：Windows 计划任务 `WUJI-Kaiwu-COS-Prune`，每周日 03:30，运行 `scripts/cos-prune-releases.ps1`；日志在 `~\.kaiwu-ops\cos-prune.log`。

## 5. 文档站（kaiwu.chengqiyun.com/docs）
1. 构建：`yarn --cwd apps/docs build`，输出目录 `apps/docs/out`。
   - 已知问题：本地化（中文）页面与自动生成的英文参考页（`agents/capabilities`、`extras/feature-flags`）会被判为“生成页已过期”，导致构建失败。**不要执行 `generate:reference`**，它会用英文覆盖已翻译的页面。临时办法：调用 `runDocsBuild` 时只忽略 `generated` 这一类问题，链接和标签检查照常执行。根治办法是让生成器输出中文，或把中文译稿纳入生成源。
2. 部署到服务器 `/opt/wuji-kaiwu/docs/html`（`kaiwu-docs` nginx 以只读方式绑定挂载）：
   - 先备份：`rsync -a --exclude releases/ html/ html.bak-<时间戳>/`；
   - 原地同步：`rsync -a --delete --exclude releases/ <新导出>/ html/`。**必须排除 `releases/`**，里面放着 APK/IPA 下载文件，它们不属于导出内容；
   - 不要用 `mv` 整体替换目录：绑定挂载指向的是原目录的 inode，替换后容器仍会提供旧内容。

## 6. 热更新（OTA，自建）
开物 App 的界面代码通过**自建、带签名**的热更新服务推送，改界面不必重新打包原生 App。

- **服务**：`apps/ota-server`（实现 expo-updates 协议 v1），生产环境是容器 `kaiwu-ota`（Lighthouse，`chengqiyun_default` 网络，256MB 内存）。Caddy 用 `handle /ota/*` 转发给它，对外地址 `https://kaiwu.chengqiyun.com/ota`。
  - 数据目录：`/opt/wuji-kaiwu/ota/data`，只读挂载；
  - 私钥：`/opt/wuji-kaiwu/ota/keys/private-key.pem`（600，只读挂载）。本机备份在 `D:\Projects\qianyuan-wuji\secrets\kaiwu-ota\private-key.pem`，**绝不进 git**。
- **App 侧**（`apps/ui/app.config.js`）：
  - 默认从 `https://kaiwu.chengqiyun.com/ota/api/manifest` 取更新；
  - 用 `certs/kaiwu-ota-certificate.pem`（keyid `main`，rsa-v1_5-sha256）验签，签名不对的更新一律拒收；
  - **永远不连 u.expo.dev**。2026-09-29 事故：默认 EAS 项目是上游 Happier 的，装好的开物 App 被换成了上游的界面代码；
  - `KAIWU_EXPO_UPDATES_ENABLED=0` 可以关闭热更新。
- **原生版本号**：`apps/ui/package.json` 里的 `happierExpoRuntimeVersion`（当前是 `kaiwu-1-native`）。热更新只会下发给原生版本号相同的 App。**改了原生层**（新增原生依赖、升级 Expo SDK、改原生配置）就必须同时升这个版本号（例如 `kaiwu-2-native`）并重新打原生包；只改 JS 或界面，就发热更新。
- **发布**（PowerShell，先设置 `KAIWU_DEPLOY_SSH_BIN` 和 `KAIWU_DEPLOY_SCP_BIN` 指向 Git 的 ssh/scp）：
  ```powershell
  $env:APP_ENV='production'
  node scripts/ota/publish-ota.mjs --platform all --channel production --target ubuntu@150.158.55.6:/opt/wuji-kaiwu/ota/data --message "<说明>"
  node scripts/ota/verify-production.mjs --platform all   # 验签、检查 expoClient、抽查资源 hash
  ```
  每次发布会生成新的 updateId，写入 `<runtime>/<updateId>/`，并原子替换 `current-<platform>-<channel>.json`，旧指针记入 `history-*.json`。
- **回滚**：`node scripts/ota/rollback-ota.mjs ...` 回到上一个 updateId；加 `--to-embedded` 则让客户端退回安装包内置的版本。
- **重打原生包后必须重发一次热更新**：客户端只会采用发布时间晚于安装包内置版本的更新，比内置版本旧的一律静默忽略（2026-09-30：00:49 发的更新比之后重打的 `204b24b` 原生包早，手机拿到清单却不应用）。
- **注意**：iOS 的 JS 包约 67MB，源站带宽只有 6 Mbps。热更新只会下载变化过的资源，但 JS 包每次都要整个重新下载。


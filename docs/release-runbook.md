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
- **不能用 COS 默认域名分发 IPA/APK**（COS 会返回 `DownloadForbidden`）。IPA 放到服务器 `/opt/wuji-kaiwu/docs/html/releases/mobile/kaiwu.ipa`，经 `https://kaiwu.wujilabs.cn/download/ios` 下载（Caddy `chengqiyun-caddy-1` 里配置的 302 跳转）。APK 同理：`/download/android`。
- 修改 Caddyfile 前先备份，然后在 `chengqiyun-caddy-1` 里依次执行 `caddy validate` 和 `caddy reload`。**注意**：`huaxu-baoguang-web-1` 也用 Caddy 镜像，按镜像名匹配容器会选错。

## 4. COS 旧包清理
- 规则：只保留最新 2 个版本。`latest.json` 指向的版本和安装脚本里的兜底版本永远不删。
- 手动执行：`python scripts/cos-prune-releases.py`（默认只列出将删除的内容），加 `--apply` 才真正删除。
- 定期执行：Windows 计划任务 `WUJI-Kaiwu-COS-Prune`，每周日 03:30，运行 `scripts/cos-prune-releases.ps1`；日志在 `~\.kaiwu-ops\cos-prune.log`。

## 5. 文档站（kaiwu.wujilabs.cn/docs）
1. 构建：`yarn --cwd apps/docs build`，输出目录 `apps/docs/out`。
   - 已知问题：本地化（中文）页面与自动生成的英文参考页（`agents/capabilities`、`extras/feature-flags`）会被判为“生成页已过期”，导致构建失败。**不要执行 `generate:reference`**，它会用英文覆盖已翻译的页面。临时办法：调用 `runDocsBuild` 时只忽略 `generated` 这一类问题，链接和标签检查照常执行。根治办法是让生成器输出中文，或把中文译稿纳入生成源。
2. 部署到服务器 `/opt/wuji-kaiwu/docs/html`（`kaiwu-docs` nginx 以只读方式绑定挂载）：
   - 先备份：`rsync -a --exclude releases/ html/ html.bak-<时间戳>/`；
   - 原地同步：`rsync -a --delete --exclude releases/ <新导出>/ html/`。**必须排除 `releases/`**，里面放着 APK/IPA 下载文件，它们不属于导出内容；
   - 不要用 `mv` 整体替换目录：绑定挂载指向的是原目录的 inode，替换后容器仍会提供旧内容。

## 6. 热更新（OTA，自建）
开物 App 的界面代码通过**自建、带签名**的热更新服务推送，改界面不必重新打包原生 App。

- **服务**：`apps/ota-server`（实现 expo-updates 协议 v1），生产环境是容器 `kaiwu-ota`（Lighthouse，`chengqiyun_default` 网络，256MB 内存）。Caddy 用 `handle /ota/*` 转发给它，对外地址 `https://kaiwu.wujilabs.cn/ota`。
  - 数据目录：`/opt/wuji-kaiwu/ota/data`，只读挂载；
  - 私钥：`/opt/wuji-kaiwu/ota/keys/private-key.pem`（600，只读挂载）。本机备份在 `D:\Projects\qianyuan-wuji\secrets\kaiwu-ota\private-key.pem`，**绝不进 git**。
- **App 侧**（`apps/ui/app.config.js`）：
  - 默认从 `https://kaiwu.wujilabs.cn/ota/api/manifest` 取更新；
  - 用 `certs/kaiwu-ota-certificate.pem`（keyid `main`，rsa-v1_5-sha256）验签，签名不对的更新一律拒收；
  - **永远不连 u.expo.dev**。2026-09-29 事故：默认 EAS 项目是上游 无极开物 的，装好的开物 App 被换成了上游的界面代码；
  - `KAIWU_EXPO_UPDATES_ENABLED=0` 可以关闭热更新。
- **原生版本号**：`apps/ui/package.json` 里的 `happierExpoRuntimeVersion`（当前是 `kaiwu-1-native`）。新增原生模块时，如果界面代码在模块缺席时能自行关闭对应功能，就不必升版本号：例如后台会话刷新用到的 `expo-background-task` / `expo-task-manager`，`index.ts` 会先用 `requireOptionalNativeModule` 探测，旧安装包上不注册后台任务、其余照常，新打的原生包自动启用。热更新只会下发给原生版本号相同的 App。**改了原生层**（新增原生依赖、升级 Expo SDK、改原生配置）就必须同时升这个版本号（例如 `kaiwu-2-native`）并重新打原生包；只改 JS 或界面，就发热更新。
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


## 7. 服务端（自建镜像，2026-10-16 起）
生产中继 `wuji-kaiwu-server` 跑的是本仓构建的 `wuji-labs/kaiwu-relay:<版本>`，**不再使用上游 `happierdev/relay-server`**。上游镜像读 `HAPPIER_*` 变量、默认开中心错误上报；本仓代码读 `KAIWU_*`。
1. 构建运行时（PowerShell，主工作区）：`node scripts/pipeline/release/build-server-binaries.mjs --channel production --version <X>-kw.<N> --targets linux-x64`，产物在 `dist/release-assets/server/`。
   - Windows 上交叉编译需要两样 Linux 原生件：`@img/sharp-linux-x64` 与 `@img/sharp-libvips-linux-x64`（版本见 `sharp` 的 optionalDependencies），用 `npm pack` 下载后解压到 `node_modules/@img/`；
   - Bun 交叉编译所需的 `bun-linux-x64-baseline-v<bun版本>` 若从 npmmirror 下载失败（报 `Failed to extract executable`），用 `npm pack @oven/bun-linux-x64-baseline@<bun版本>` 取 `package/bin/bun`，复制到 `bun pm cache` 打印的目录下、文件名即 `bun-linux-x64-baseline-v<bun版本>`。
2. 上传产物与 checksums 到 COS `releases/server/<版本>/`，生产机从 COS 下载并 `sha256sum -c`（不走 6 Mbps 源站）。
3. 生产机 `/opt/wuji-kaiwu/server-image/`：解压到 `server/`、放 `docker/kaiwu-relay/Dockerfile` 与 `apps/server/scripts/run-server.sh`，`docker build -t wuji-labs/kaiwu-relay:<版本> .`。Dockerfile 负责补可执行位（Windows 打包不带 POSIX 权限）。
4. **先演练再切换**：`sqlite3 ... "VACUUM INTO '/stage/...'"` 取一致副本（不要用 `.backup`，生产库持续写入时它会反复重来），新镜像挂副本在 `127.0.0.1:3098` 起一份，核对 `/v1/features`、`/`、需登录接口 401、`Account`/`Session` 计数与 `_prisma_migrations` 无失败项。
5. 切换：compose 里 `image:` 改为新标签，`docker compose up -d --no-deps wuji-kaiwu-server`；起来后核对首页是 HTML（不是纯文本）、`/favicon.ico` 200、`/v1/features` 的 `canonicalServerUrl` 与 `bugReports.providerUrl`，并看一台成员机守护日志重新 `Connected`。
6. 回滚：compose 改回上一个镜像标签再 `up -d --no-deps wuji-kaiwu-server`；改 compose 前一律留 `docker-compose.yml.bak-<时间戳>`。

## 8. 发版后自动上架官网下载中心（kaiwu.wujilabs.cn/download）
每次各平台构建新版本并完成测试验证后，必须将最新安装包上架至官方全平台下载中心，并更新机器可读清单 `manifest.json` 与 Caddy 跳转。

### 8.1 自动化上架脚本
统一通过以下脚本完成上架，无需手工登录服务器搬迁文件或拼凑命令：
```powershell
node scripts/release/publish-downloads.mjs --platform <平台> --version <版本> --file <本地产物路径>
```

**支持的平台标识**：
- `desktop-windows`: Tauri Windows x64 桌面客户端（按集团安全规范以 `.zip` 分发）
- `desktop-macos`: Tauri macOS Apple 芯片桌面客户端（`.dmg`，Developer ID 签名 + 公证）
- `desktop-macos-intel`: Tauri macOS Intel 桌面客户端（`.dmg`）
- `desktop-linux`: Tauri Linux x64 桌面客户端（`.AppImage`）
- `windows`: Windows x64 命令行/便携包（按集团安全规范压制为 `.zip`）
- `macos`: macOS 核心命令行包（`.tgz`）
- `linux`: Linux 核心命令行包（`.tgz`）
- `android`: Android APK 安装包（`.apk`）
- `ios`: iOS 未签名侧载包（`.ipa`）
- `server`: 自托管服务端核心包（`.tar.gz`）
- `npm`: npm 模块离线包（`.tgz`）
- `harmony`: HarmonyOS 原生包（`.hap`，工具链/签名就绪前保持「即将提供」）

### 8.2 脚本核心执行逻辑
1. **本地校验**：校验文件存在性，计算本地文件大小与 SHA256 哈希。
2. **带宽保护传输**：对于大于 50MB 的安装包，自动使用腾讯云 COS（`kaiwu-static-1444025891`）作为内网高速中转通道，再由生产服务器直接拉取落地，避免 6 Mbps 源站出口带宽被打满导致线上请求阻塞；小于 50MB 的小文件采用 SCP 直传。
3. **版本化组织**：服务端产物组织于 `/opt/wuji-kaiwu/docs/html/releases/<平台>/<版本>/<文件名>`，并原子更新 `/opt/wuji-kaiwu/docs/html/releases/<平台>/latest/<别名>`。
4. **哈希严格比对**：在服务器磁盘执行 `sha256sum` 比对，确保传输完全一致。
5. **更新清单**：更新 `/opt/wuji-kaiwu/docs/html/download/manifest.json`，记录最新版本号、文件名、体积、SHA256、下载直链与部署命令。
6. **线上可用性复验**：通过 `curl -sSLI https://kaiwu.wujilabs.cn/download/<平台>` 自动验证 302 重定向到 200 OK 且 Content-Length 与本地一致。

### 8.3 注意事项与规范
- **Windows 防拦截规范**：exe 安装包必须打成 `.zip` 格式分发（参见 `D:\Projects\qianyuan-wuji` 记忆「Windows客户端发布防拦截规范」），发版后提报微软 Defender Security Intelligence 白名单。
- **并行合同协同**：若 K500 合同或其他功能分支发布了新版本（如突破上传上限后的新版 CLI），在该版本构建完成后，直接调用 `publish-downloads.mjs` 传入新版本产物即可无缝刷新下载中心，无需重复调整服务器 Caddy 路由基础架构。

### 8.4 桌面端构建、自动更新源与下载页（2026-10-21）
- **构建**：`gh workflow run build-desktop-wuji.yml -R wuji-labs/kaiwu --ref wuji/main -f environment=production -f source_ref=wuji/main -f publish_release=false -f release_message="无极开物桌面端"`。Apple 证书与公证密钥已在仓库 secrets；**先改 secrets 再触发**（run 创建时快照 secrets）。
- **取产物**：GitHub 产物直连极慢，走路由器代理分段下载（`--socks5-hostname 192.168.8.1:1071`）。
- **自动更新源**：`uv run --no-project --with pynacl --with cos-python-sdk-v5 python -I scripts/release/desktop_update_feed.py --version <v> --entry <平台>=<更新包>`（验签→上传 COS→合并 `download/desktop/latest.json`→回读）。
- **下载页**：改 `apps/website/public/download/index.html` 后运行 `python -I scripts/release/deploy_download_page.py`（备份→上传→线上哈希比对→1440/390 截图，打印回滚命令）。
- **Windows 命令行包不提供 zip 下载**：5.7 万文件、路径最长 444 字符，系统自带解压报「无效」；下载页只给 `irm https://kaiwu.wujilabs.cn/install.ps1 | iex`。

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

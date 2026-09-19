& {
# 无极开物 CLI 官方极速安装脚本 (Windows)
# WUJI-Labs · 乾元执中
#
# 特性：
# 1. 纯原生绿色免安装单文件架构：内置所有 runtime 与本地模型调度依赖，无需 Node.js、npm 或 C++ 编译环境。
# 2. 全程走国内腾讯云上海 BGP 对象存储高速通道，数秒极速完成。
# 3. 自动解压至 ~/.kaiwu/bin，并注册系统用户 PATH 环境变量（永久生效）。
# 4. 自动持久化配置无极开物中继服务端 (KAIWU_SERVER_URL)。
# 5. 原生注册唯一官方主命令 kaiwu。

[CmdletBinding()]
param(
    [string]$Version = "",
    [string]$ServerUrl = "",
    [string]$InstallDir = ""
)

$ErrorActionPreference = "Stop"

# 解决 PowerShell 控制台编码输出乱码
try {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [Console]::OutputEncoding = $utf8
    [Console]::InputEncoding = $utf8
    $OutputEncoding = $utf8
} catch {}

$KAIWU_SERVER_URL = if ($ServerUrl) {
    $ServerUrl
} elseif ($env:KAIWU_SERVER_URL) {
    $env:KAIWU_SERVER_URL
} else {
    "https://kaiwu.chengqiyun.com"
}

$LATEST_METADATA_URL = "https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/releases/cli/latest.json"
$DEFAULT_VERSION = "0.2.16"
$DEFAULT_ARCHIVE_URL = "https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/releases/cli/$DEFAULT_VERSION/kaiwu-v$DEFAULT_VERSION-windows-x64.tar.gz"
$DEFAULT_ARCHIVE_SHA256 = "0c731060355027324d146575ed4cfd9f93558e8b206e1d4fba10d727201ffe96"

function Write-Info {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[警告] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "[错误] $Message" -ForegroundColor Red
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "         无极开物 (Kaiwu) CLI 快速安装程序        " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检测系统架构
if ([IntPtr]::Size -ne 8) {
    Write-Err "当前仅支持 Windows 64位 (x64) 操作系统。"
    exit 1
}

# 2. 获取版本信息
Write-Info "正在获取最新发布版本..."
$downloadUrl = $DEFAULT_ARCHIVE_URL
$targetVersion = $DEFAULT_VERSION
$expectedSha = $DEFAULT_ARCHIVE_SHA256

try {
    $meta = Invoke-RestMethod -Uri $LATEST_METADATA_URL -UseBasicParsing -TimeoutSec 5
    if ($meta -and $meta.version -and $meta.windows_x64 -and $meta.windows_x64_sha256) {
        $downloadUrl = $meta.windows_x64
        $targetVersion = $meta.version
        $expectedSha = ([string]$meta.windows_x64_sha256).ToLowerInvariant()
    }
} catch {
    Write-Warn "未能从元数据中心获取最新版本，回退至内置稳定版本 ($targetVersion)"
}

Write-Info "准备安装版本: v$targetVersion (免 Node.js 独立完整运行版)"

# 3. 准备目标安装路径 (~/.kaiwu/bin)
if ($InstallDir) {
    $kaiwuHome = $InstallDir
} else {
    $kaiwuHome = Join-Path $HOME ".kaiwu"
}
$binDir = Join-Path $kaiwuHome "bin"
$tempDir = Join-Path $kaiwuHome "temp"

if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
}
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
}

$tarGzFile = Join-Path $tempDir "kaiwu-latest-windows-x64.tar.gz"

# 4. 高速下载预编译包
Write-Info "正在从国内腾讯云 BGP 高速通道下载完整程序包..."
try {
    # 优先使用 WebClient / HttpClient 实现高吞吐下载
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($downloadUrl, $tarGzFile)
} catch {
    Write-Warn "WebClient 下载异常，尝试使用 Invoke-WebRequest..."
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tarGzFile -UseBasicParsing
}

if (-not (Test-Path $tarGzFile)) {
    Write-Err "下载发布包失败，请检查网络连接。"
    exit 1
}

if ($expectedSha -and $expectedSha -notmatch '^[a-f0-9]{64}$') {
    Write-Err "发布元数据中的 SHA256 格式无效，拒绝继续安装。"
    exit 1
}
if ($expectedSha) {
    $actualSha = (Get-FileHash -Path $tarGzFile -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha -ne $expectedSha) {
        Write-Err "发布包 SHA256 校验失败，拒绝安装。"
        exit 1
    }
    Write-Info "发布包 SHA256 校验通过。"
}

# 5. 解压程序
Write-Info "正在展开并配置开物运行时..."
$extractTemp = Join-Path $tempDir "extract"
if (Test-Path $extractTemp) {
    Remove-Item -LiteralPath $extractTemp -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $extractTemp | Out-Null

$tarExe = "C:\Windows\System32\tar.exe"
if (Get-Command tar -ErrorAction SilentlyContinue) {
    $tarExe = (Get-Command tar).Source
}

if (Test-Path $tarExe) {
    & $tarExe -xzf $tarGzFile -C $extractTemp
} else {
    Write-Err "未在系统中找到 tar.exe 解压工具（Windows 10 17063+ 原生内置）。"
    exit 1
}

# 查找解压出的目录并展平单层目录结构
$extractedEntries = @(Get-ChildItem -Path $extractTemp -Force)
$extractedDirs = @($extractedEntries | Where-Object { $_.PSIsContainer })
$extractedFiles = @($extractedEntries | Where-Object { -not $_.PSIsContainer })

# 若只有一个顶层目录（无同级文件），则取该目录内容；否则直接用提取根
if ($extractedDirs.Count -eq 1 -and $extractedFiles.Count -eq 0) {
    $extractedFolder = $extractedDirs[0]
    Write-Info "检测到单层顶级目录 '$($extractedFolder.Name)'，展平其内容至 bin"
} else {
    $extractedFolder = Get-Item -Path $extractTemp
}

if (-not $extractedFolder) {
    Write-Err "解压目录结构异常，请重试。"
    exit 1
}

# 清理 bin 目录下的旧目录，确保整体替换
foreach ($dir in @("package-dist", "node_modules", "scripts", "tools")) {
    $dirPath = Join-Path $binDir $dir
    if (Test-Path $dirPath) {
        Remove-Item -Path $dirPath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# 将二进制与 bundle 复制到 bin 目录 (使用 robocopy 处理深层嵌套的 node_modules)
$extractPath = $extractedFolder.FullName
$robocopyExe = "C:\Windows\System32\robocopy.exe"

if (Test-Path $robocopyExe) {
    # 使用 robocopy 复制整个目录树，忽略长路径问题
    & $robocopyExe $extractPath $binDir /E /NFL /NDL /NJH /NJS /NC /NS /NP 2>&1 | Out-Null
} else {
    # 后备方案：逐个复制子项 (避免通配符问题)
    Get-ChildItem -Path $extractPath | ForEach-Object {
        Copy-Item -Path $_.FullName -Destination $binDir -Recurse -Force
    }
}

# 清理临时下载文件
try {
    if (Test-Path $tarGzFile) { Remove-Item -Force $tarGzFile -ErrorAction SilentlyContinue }
} catch {}

# 6. 配置用户级环境变量 PATH 与 KAIWU_SERVER_URL
Write-Info "正在配置环境变量与系统连接..."
$userPath = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::User)
if (-not $userPath) { $userPath = "" }

$pathEntries = $userPath.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($pathEntries -notcontains $binDir) {
    $newPath = ($pathEntries + $binDir) -join ';'
    [System.Environment]::SetEnvironmentVariable("Path", $newPath, [System.EnvironmentVariableTarget]::User)
    Write-Info "已将 $binDir 添加至用户 PATH 环境变量"
}

# 立即刷新当前进程环境
if ($env:Path -split ';' -notcontains $binDir) {
    $env:Path = "$binDir;$env:Path"
}

# 设置并持久化开物服务端连接
[System.Environment]::SetEnvironmentVariable('KAIWU_SERVER_URL', $KAIWU_SERVER_URL, [System.EnvironmentVariableTarget]::User)
$env:KAIWU_SERVER_URL = $KAIWU_SERVER_URL
Write-Info "已配置开物服务端连接: $KAIWU_SERVER_URL"

# 配置或刷新向后兼容别名 happier.exe（指向主程序 kaiwu.exe）
$kaiwuExePath = Join-Path $binDir "kaiwu.exe"
$happierExePath = Join-Path $binDir "happier.exe"
if (Test-Path $kaiwuExePath) {
    try {
        Copy-Item -Path $kaiwuExePath -Destination $happierExePath -Force -ErrorAction Stop
        Write-Info "已建立兼容别名: happier.exe -> kaiwu.exe"
    } catch {
        Write-Warn "未能刷新兼容别名 $happierExePath (文件被运行中进程锁定)。主命令 kaiwu.exe 已就绪，后台服务与 CLI 均使用主可执行文件，系统运行安全不受影响。"
    }
}

# 确保运行时资产目录联接 (cli/current -> bin)，保证 Claude Code 专用 hook 与 sidecar 脚本正常加载
$cliCurrentDir = Join-Path $kaiwuHome "cli\current"
if (-not (Test-Path $cliCurrentDir)) {
    try {
        $cliParentDir = Join-Path $kaiwuHome "cli"
        if (-not (Test-Path $cliParentDir)) {
            New-Item -ItemType Directory -Force -Path $cliParentDir | Out-Null
        }
        New-Item -ItemType Junction -Path $cliCurrentDir -Target $binDir | Out-Null
        Write-Info "已建立运行时资产目录联接: $cliCurrentDir -> $binDir"
    } catch {
        Write-Warn "建立目录联接失败，尝试创建软链接: $_"
        try {
            New-Item -ItemType SymbolicLink -Path $cliCurrentDir -Target $binDir | Out-Null
        } catch {}
    }
}

# 7. 运行验证 (强制性自检，失败则报错退出)
Write-Host ""
Write-Info "执行安装后自检..."
Write-Host ""

$exePath = Join-Path $binDir "kaiwu.exe"
if (-not (Test-Path $exePath)) {
    Write-Err "自检失败：未找到 $exePath"
    exit 1
}

try {
    $v = & $exePath --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "自检失败：kaiwu.exe --version 返回错误代码 $LASTEXITCODE"
        exit 1
    }
    Write-Success "恭喜！无极开物 CLI 已秒级安装就绪！"
    Write-Host ""
    Write-Host "  • 当前安装版本: v$v" -ForegroundColor Green
    Write-Host "  • 程序所在目录: $binDir" -ForegroundColor Gray
    Write-Host "  • 开物中继服务: $KAIWU_SERVER_URL" -ForegroundColor Gray
    Write-Host "  • 核心命令: kaiwu" -ForegroundColor Gray
} catch {
    Write-Err "自检失败：执行 kaiwu.exe --version 时出错：$_"
    exit 1
}

Write-Host ""
Write-Host "下一步快速开始：" -ForegroundColor White
Write-Host "  1. 连接配对本机与手机/控制台：" -ForegroundColor Yellow
Write-Host "     kaiwu setup" -ForegroundColor Cyan
Write-Host "  2. 在任何项目目录中启动 AI 编程会话：" -ForegroundColor Yellow
Write-Host "     cd D:\你的代码目录" -ForegroundColor Gray
Write-Host "     kaiwu" -ForegroundColor Cyan
Write-Host ""
Write-Host "注：若在其他现有终端窗口中使用，请重新开启终端窗口以加载最新 PATH。" -ForegroundColor DarkGray
Write-Host ""
} @args

# 无极开物 CLI 官方极速安装脚本 (Windows)
# WUJI-Labs · 乾元执中
#
# 特性：
# 1. 纯原生绿色免安装单文件架构：内置所有 runtime 与本地模型调度依赖，无需 Node.js、npm 或 C++ 编译环境。
# 2. 全程走国内腾讯云上海 BGP 对象存储高速通道，数秒极速完成。
# 3. 自动解压至 ~/.kaiwu/bin，并注册系统用户 PATH 环境变量（永久生效）。
# 4. 自动持久化配置开物云端中继服务端 (HAPPIER_SERVER_URL)。
# 5. 同时提供 kaiwu 与 happier 双命令别名，完全无缝兼容。

[CmdletBinding()]
param(
    [string]$Version = "",
    [string]$ServerUrl = ""
)

$ErrorActionPreference = "Stop"

# 解决 PowerShell 控制台编码输出乱码
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

$KAIWU_SERVER_URL = if ($ServerUrl) {
    $ServerUrl
} elseif ($env:HAPPIER_SERVER_URL) {
    $env:HAPPIER_SERVER_URL
} else {
    "https://kaiwu.chengqiyun.com"
}

$LATEST_METADATA_URL = "https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/releases/cli/latest.json"
$DEFAULT_ARCHIVE_URL = "https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/releases/cli/0.2.12/kaiwu-v0.2.12-windows-x64.tar.gz"

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
$targetVersion = "0.2.12"
$expectedSha = ""

try {
    $meta = Invoke-RestMethod -Uri $LATEST_METADATA_URL -UseBasicParsing -TimeoutSec 5
    if ($meta -and $meta.windows_x64) {
        $downloadUrl = $meta.windows_x64
        $targetVersion = $meta.version
        $expectedSha = $meta.windows_x64_sha256
    }
} catch {
    Write-Warn "未能从元数据中心获取最新版本，回退至内置稳定版本 ($targetVersion)"
}

Write-Info "准备安装版本: v$targetVersion (免 Node.js 独立完整运行版)"

# 3. 准备目标安装路径 (~/.kaiwu/bin)
$kaiwuHome = Join-Path $HOME ".kaiwu"
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

# 5. 解压程序
Write-Info "正在展开并配置开物运行时..."
$extractTemp = Join-Path $tempDir "extract"
if (Test-Path $extractTemp) {
    Get-ChildItem -Path $extractTemp -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
    Remove-Item -Force -Path $extractTemp -ErrorAction SilentlyContinue
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

# 查找解压出的目录
$extractedFolder = Get-ChildItem -Path $extractTemp -Directory | Select-Object -First 1
if (-not $extractedFolder) {
    Write-Err "解压目录结构异常，请重试。"
    exit 1
}

# 将二进制与 bundle 复制到 bin 目录
Copy-Item -Path (Join-Path $extractedFolder.FullName "*") -Destination $binDir -Recurse -Force

# 清理临时下载文件
try {
    if (Test-Path $tarGzFile) { Remove-Item -Force $tarGzFile -ErrorAction SilentlyContinue }
} catch {}

# 6. 配置用户级环境变量 PATH 与 HAPPIER_SERVER_URL
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
[System.Environment]::SetEnvironmentVariable('HAPPIER_SERVER_URL', $KAIWU_SERVER_URL, [System.EnvironmentVariableTarget]::User)
$env:HAPPIER_SERVER_URL = $KAIWU_SERVER_URL
Write-Info "已配置开物服务端连接: $KAIWU_SERVER_URL"

# 7. 运行验证
Write-Host ""
Write-Success "恭喜！无极开物 CLI 已秒级安装就绪！"
Write-Host ""

$exePath = Join-Path $binDir "kaiwu.exe"
if (Test-Path $exePath) {
    $v = & $exePath --version
    Write-Host "  • 当前安装版本: v$v" -ForegroundColor Green
    Write-Host "  • 程序所在目录: $binDir" -ForegroundColor Gray
    Write-Host "  • 开物中继服务: $env:HAPPIER_SERVER_URL" -ForegroundColor Gray
    Write-Host "  • 包含命令别名: kaiwu, happier" -ForegroundColor Gray
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

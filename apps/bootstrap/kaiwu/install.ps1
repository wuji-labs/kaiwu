# 无极开物 CLI 安装脚本 · WUJI-Labs · 基于 happier-dev/happier 二次开发
#
# 该脚本在 Windows PowerShell 环境下运行，自动检测 Node.js 运行环境，
# 从腾讯云 COS 下载开物 CLI 发布包并安装，同时持久化配置开物服务器 URL。

$ErrorActionPreference = "Stop"

$KAIWU_SERVER_URL = if ($env:HAPPIER_SERVER_URL) { $env:HAPPIER_SERVER_URL } else { "https://kaiwu.chengqiyun.com" }
$LATEST_METADATA_URL = "https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/releases/cli/latest.json"
$FALLBACK_TGZ_URL = "https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/releases/cli/0.2.12/kaiwu-cli-0.2.12.tgz"

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

Write-Info "开始安装 无极开物 CLI (happier)..."

# 1. 检测 Node.js (要求 >= 20)
$hasNode = $false
try {
    $nodeVerRaw = & node -v 2>$null
    if ($nodeVerRaw) {
        $nodeMajor = [int]($nodeVerRaw.TrimStart('v').Split('.')[0])
        if ($nodeMajor -ge 20) {
            $hasNode = $true
            Write-Info "检测到系统已安装 Node.js: $nodeVerRaw"
        } else {
            Write-Warn "当前系统 Node.js 版本 ($nodeVerRaw) 低于 20，建议升级。"
        }
    }
} catch {
    $hasNode = $false
}

if (-not $hasNode) {
    Write-Warn "未检测到 Node.js (>= 20)。开物 CLI 依赖 Node.js 运行环境。"
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        $isInteractive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
        $shouldInstall = $false
        if ($isInteractive) {
            $choice = Read-Host "是否使用 winget 自动安装 Node.js LTS? (Y/n)"
            if ($choice -eq "" -or $choice -match "^[Yy]") {
                $shouldInstall = $true
            }
        }
        if ($shouldInstall) {
            Write-Info "正在通过 winget 安装 OpenJS.NodeJS.LTS..."
            winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
            # 刷新 PATH
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        } else {
            Write-Warn "非交互模式或已跳过自动安装，请确保稍后手动安装 Node.js (https://nodejs.org)。"
        }
    } else {
        Write-Warn "系统未找到 winget，请自行安装 Node.js (https://nodejs.org)。"
    }
}

# 2. 获取发布信息
Write-Info "获取最新开物 CLI 发布信息..."
$tgzUrl = $FALLBACK_TGZ_URL
$version = "0.2.12"

try {
    $metaJson = Invoke-RestMethod -Uri $LATEST_METADATA_URL -UseBasicParsing -TimeoutSec 10
    if ($metaJson -and $metaJson.tgz) {
        $tgzUrl = $metaJson.tgz
        $version = $metaJson.version
    }
} catch {
    Write-Warn "未能从元数据中心获取最新动态，使用内置稳定源: $tgzUrl"
}

Write-Info "准备安装版本: $version"
Write-Info "安装包源: $tgzUrl"

# 3. 安装 CLI
Write-Info "正在通过 npm 全局安装开物 CLI..."
try {
    npm install -g $tgzUrl
} catch {
    Write-Err "npm install 失败: $_"
    exit 1
}

# 4. 持久化环境变量 HAPPIER_SERVER_URL
Write-Info "配置开物服务端连接: $KAIWU_SERVER_URL"
[System.Environment]::SetEnvironmentVariable('HAPPIER_SERVER_URL', $KAIWU_SERVER_URL, [System.EnvironmentVariableTarget]::User)
$env:HAPPIER_SERVER_URL = $KAIWU_SERVER_URL

# 5. 验证安装
Write-Host ""
Write-Success "无极开物 CLI 安装成功！"
Write-Host ""

$happierVer = try { & happier --version 2>$null } catch { $null }
if ($happierVer) {
    Write-Host "  • 安装版本: $happierVer"
    Write-Host "  • 默认连接: $env:HAPPIER_SERVER_URL"
} else {
    Write-Host "  • 安装版本: $version"
    Write-Host "  • 提示: 若当前终端找不到 happier 命令，请重新打开终端窗口使 PATH 生效。"
}

Write-Host ""
Write-Host "下一步快速指引：" -ForegroundColor White
Write-Host "  1. 登录连接开物云服务:"
Write-Host "     happier auth login"
Write-Host "  2. 在项目目录中启动 AI 编程会话:"
Write-Host "     cd D:\Projects\你的项目目录"
Write-Host "     happier"
Write-Host ""

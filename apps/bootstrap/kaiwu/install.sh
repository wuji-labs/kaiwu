#!/usr/bin/env bash
# 无极开物 CLI 安装脚本 · WUJI-Labs
set -euo pipefail

# 默认配置
KAIWU_SERVER_URL="${KAIWU_SERVER_URL:-https://kaiwu.chengqiyun.com}"
LATEST_METADATA_URL="https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/releases/cli/latest.json"
DEFAULT_VERSION="0.2.16"
FALLBACK_TGZ_URL="https://kaiwu-static-1444025891.cos.ap-shanghai.myqcloud.com/releases/cli/${DEFAULT_VERSION}/kaiwu-cli-${DEFAULT_VERSION}.tgz"
FALLBACK_TGZ_SHA256="66d6e377377244a946c8d1c0ab2ccdce39c72486dfa7cd06f05d01e288fa9d8d"

# 颜色输出
if [[ -t 1 ]] && [[ "${TERM:-}" != "dumb" ]]; then
    COLOR_RESET=$'\033[0m'
    COLOR_BOLD=$'\033[1m'
    COLOR_GREEN=$'\033[32m'
    COLOR_YELLOW=$'\033[33m'
    COLOR_CYAN=$'\033[36m'
    COLOR_RED=$'\033[31m'
else
    COLOR_RESET=""
    COLOR_BOLD=""
    COLOR_GREEN=""
    COLOR_YELLOW=""
    COLOR_CYAN=""
    COLOR_RED=""
fi

info() {
    printf "%s==> %s%s\n" "${COLOR_CYAN}" "$*" "${COLOR_RESET}"
}

success() {
    printf "%s==> %s%s\n" "${COLOR_GREEN}" "$*" "${COLOR_RESET}"
}

warn() {
    printf "%s[警告] %s%s\n" "${COLOR_YELLOW}" "$*" "${COLOR_RESET}"
}

error() {
    printf "%s[错误] %s%s\n" "${COLOR_RED}" "$*" "${COLOR_RESET}" >&2
}

info "开始安装 无极开物 CLI..."

# 1. 检测与准备 Node.js (要求 >= 20)
NODE_BIN=""
check_node_version() {
    local cmd="$1"
    if command -v "$cmd" >/dev/null 2>&1; then
        local ver
        ver=$("$cmd" -v 2>/dev/null | tr -d 'v' | cut -d'.' -f1)
        if [[ -n "$ver" ]] && [[ "$ver" -ge 20 ]]; then
            echo "$cmd"
            return 0
        fi
    fi
    return 1
}

if check_node_version node >/dev/null 2>&1; then
    NODE_BIN="node"
    info "检测到系统已安装 Node.js: $(node -v)"
elif [[ -x "$HOME/.kaiwu/node/bin/node" ]] && check_node_version "$HOME/.kaiwu/node/bin/node" >/dev/null 2>&1; then
    export PATH="$HOME/.kaiwu/node/bin:$PATH"
    NODE_BIN="$HOME/.kaiwu/node/bin/node"
    info "检测到 ~/.kaiwu/node 已有可用 Node.js: $($NODE_BIN -v)"
else
    info "未检测到满足版本要求的 Node.js (>= 20)，准备自动安装官方 Node.js LTS 到 ~/.kaiwu/node..."
    mkdir -p "$HOME/.kaiwu/node"

    # 检测系统架构与平台
    OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    ARCH="$(uname -m)"
    case "$ARCH" in
        x86_64|amd64) NODE_ARCH="x64" ;;
        aarch64|arm64) NODE_ARCH="arm64" ;;
        *) error "不支持的 CPU 架构: $ARCH"; exit 1 ;;
    esac

    case "$OS" in
        linux) NODE_OS="linux" ;;
        darwin) NODE_OS="darwin" ;;
        *) error "不支持的操作系统: $OS"; exit 1 ;;
    esac

    NODE_VERSION="20.18.0"
    NODE_DIST="node-v${NODE_VERSION}-${NODE_OS}-${NODE_ARCH}"
    NODE_TARBALL="${NODE_DIST}.tar.gz"
    NODE_DOWNLOAD_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"

    info "正在下载 Node.js v${NODE_VERSION} (${NODE_OS}-${NODE_ARCH})..."
    TMP_DIR="$(mktemp -d)"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$NODE_DOWNLOAD_URL" -o "$TMP_DIR/$NODE_TARBALL"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$NODE_DOWNLOAD_URL" -O "$TMP_DIR/$NODE_TARBALL"
    else
        error "需要 curl 或 wget 下载 Node.js，请先安装基础网络工具。"
        exit 1
    fi

    info "解压并安装 Node.js 到 $HOME/.kaiwu/node..."
    tar -xzf "$TMP_DIR/$NODE_TARBALL" -C "$TMP_DIR"
    rm -rf "$HOME/.kaiwu/node"/*
    cp -R "$TMP_DIR/$NODE_DIST"/* "$HOME/.kaiwu/node/"
    rm -rf "$TMP_DIR"

    export PATH="$HOME/.kaiwu/node/bin:$PATH"
    NODE_BIN="$HOME/.kaiwu/node/bin/node"
    info "Node.js 自动部署完成: $($NODE_BIN -v)"
fi

# 2. 获取发布包下载地址与版本
info "获取最新开物 CLI 发布信息..."
TGZ_URL="$FALLBACK_TGZ_URL"
TGZ_SHA256="$FALLBACK_TGZ_SHA256"
CLI_VERSION="$DEFAULT_VERSION"

if command -v curl >/dev/null 2>&1; then
    LATEST_JSON=$(curl -fsSL "$LATEST_METADATA_URL" 2>/dev/null || true)
    if [[ -n "$LATEST_JSON" ]]; then
        RESOLVED_URL=$(echo "$LATEST_JSON" | grep -o '"tgz": "[^"]*' | cut -d'"' -f4 || true)
        RESOLVED_VER=$(echo "$LATEST_JSON" | grep -o '"version": "[^"]*' | cut -d'"' -f4 || true)
        if [[ -n "$RESOLVED_URL" ]]; then
            TGZ_URL="$RESOLVED_URL"
        fi
        RESOLVED_SHA=$(echo "$LATEST_JSON" | grep -o '"tgz_sha256": "[^"]*' | cut -d'"' -f4 || true)
        if [[ -n "$RESOLVED_SHA" ]]; then
            TGZ_SHA256="$RESOLVED_SHA"
        fi
        if [[ -n "$RESOLVED_VER" ]]; then
            CLI_VERSION="$RESOLVED_VER"
        fi
    fi
fi

info "准备安装版本: ${CLI_VERSION}"
info "安装包源: ${TGZ_URL}"

if [[ -n "$TGZ_SHA256" && ! "$TGZ_SHA256" =~ ^[a-fA-F0-9]{64}$ ]]; then
    error "发布元数据中的 SHA256 格式无效，拒绝继续安装。"
    exit 1
fi

DOWNLOAD_DIR="$(mktemp -d)"
TGZ_FILE="$DOWNLOAD_DIR/kaiwu-cli-${CLI_VERSION}.tgz"
cleanup_download() { rm -rf "$DOWNLOAD_DIR"; }
trap cleanup_download EXIT
if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$TGZ_URL" -o "$TGZ_FILE"
elif command -v wget >/dev/null 2>&1; then
    wget -q "$TGZ_URL" -O "$TGZ_FILE"
else
    error "需要 curl 或 wget 下载开物 CLI。"
    exit 1
fi
if [[ -n "$TGZ_SHA256" ]]; then
    ACTUAL_TGZ_SHA256=""
    if command -v sha256sum >/dev/null 2>&1; then
        ACTUAL_TGZ_SHA256="$(sha256sum "$TGZ_FILE" | awk '{print tolower($1)}')"
    elif command -v shasum >/dev/null 2>&1; then
        ACTUAL_TGZ_SHA256="$(shasum -a 256 "$TGZ_FILE" | awk '{print tolower($1)}')"
    else
        error "系统缺少 sha256sum 或 shasum，无法校验发布包。"
        exit 1
    fi
    if [[ "$ACTUAL_TGZ_SHA256" != "$(printf '%s' "$TGZ_SHA256" | tr '[:upper:]' '[:lower:]')" ]]; then
        error "发布包 SHA256 校验失败，拒绝安装。"
        exit 1
    fi
    info "发布包 SHA256 校验通过。"
fi

# 3. 安装开物 CLI
# 优先使用 npm 全局安装；若无全局写权限或独立 node 则安装至 ~/.kaiwu
INSTALL_SUCCESS=0
if npm install -g "$TGZ_FILE" >/dev/null 2>&1; then
    INSTALL_SUCCESS=1
    GLOBAL_KAIWU="$(command -v kaiwu 2>/dev/null || true)"
    if [[ -z "$GLOBAL_KAIWU" ]]; then
        NPM_BIN_PATH="$(npm bin -g 2>/dev/null || true)"
        if [[ -n "$NPM_BIN_PATH" ]] && [[ -f "$NPM_BIN_PATH/kaiwu" ]]; then
            GLOBAL_KAIWU="$NPM_BIN_PATH/kaiwu"
        fi
    fi
    if [[ -n "$GLOBAL_KAIWU" ]]; then
        mkdir -p "$HOME/.local/bin"
        ln -sf "$GLOBAL_KAIWU" "$HOME/.local/bin/kaiwu"
        chmod +x "$HOME/.local/bin/kaiwu"
    fi
else
    warn "npm 全局安装未成功或无 root/全局写权限，正在安装到用户目录 ~/.kaiwu..."
    mkdir -p "$HOME/.kaiwu/lib"
    (cd "$HOME/.kaiwu/lib" && npm install "$TGZ_FILE" >/dev/null 2>&1)
    mkdir -p "$HOME/.local/bin"
    CLI_BIN="$HOME/.kaiwu/lib/node_modules/@happier-dev/cli/bin/kaiwu.mjs"
    if [[ ! -f "$CLI_BIN" ]]; then
        CLI_BIN="$HOME/.kaiwu/lib/node_modules/.bin/kaiwu"
    fi
    ln -sf "$CLI_BIN" "$HOME/.local/bin/kaiwu"
    chmod +x "$HOME/.local/bin/kaiwu"
    export PATH="$HOME/.local/bin:$PATH"
    INSTALL_SUCCESS=1
fi

if ! command -v kaiwu >/dev/null 2>&1; then
    # 尝试查找 npm bin 目录
    NPM_BIN_PATH="$(npm bin -g 2>/dev/null || true)"
    if [[ -n "$NPM_BIN_PATH" ]] && [[ -f "$NPM_BIN_PATH/kaiwu" ]]; then
        export PATH="$NPM_BIN_PATH:$PATH"
        mkdir -p "$HOME/.local/bin"
        ln -sf "$NPM_BIN_PATH/kaiwu" "$HOME/.local/bin/kaiwu"
        chmod +x "$HOME/.local/bin/kaiwu"
    fi
fi

# 4. 配置用户 Shell 环境变量与 PATH
CONFIG_PROFILES=()
if [[ -f "$HOME/.bashrc" ]]; then CONFIG_PROFILES+=("$HOME/.bashrc"); fi
if [[ -f "$HOME/.zshrc" ]]; then CONFIG_PROFILES+=("$HOME/.zshrc"); fi
if [[ -f "$HOME/.profile" ]]; then CONFIG_PROFILES+=("$HOME/.profile"); fi
if [[ ${#CONFIG_PROFILES[@]} -eq 0 ]]; then
    CONFIG_PROFILES+=("$HOME/.profile")
    touch "$HOME/.profile"
fi

ENV_SNIPPET="
# >>> 无极开物 CLI 配置 >>>
export KAIWU_SERVER_URL=\"${KAIWU_SERVER_URL}\"
if [ -d \"\$HOME/.kaiwu/node/bin\" ]; then
    export PATH=\"\$HOME/.kaiwu/node/bin:\$PATH\"
fi
if [ -d \"\$HOME/.local/bin\" ]; then
    export PATH=\"\$HOME/.local/bin:\$PATH\"
fi
# <<< 无极开物 CLI 配置 <<<
"

for prof in "${CONFIG_PROFILES[@]}"; do
    if ! grep -q "KAIWU_SERVER_URL" "$prof" 2>/dev/null; then
        printf "%s\n" "$ENV_SNIPPET" >> "$prof"
        info "已写入环境变量与路径至: $prof"
    fi
done

export KAIWU_SERVER_URL="${KAIWU_SERVER_URL}"

# 5. 验证与指引 (强制性自检，失败则报错退出)
echo
info "执行安装后自检..."
echo

MAIN_CMD="kaiwu"

if ! command -v "$MAIN_CMD" >/dev/null 2>&1; then
    error "自检失败：未找到 $MAIN_CMD 命令"
    exit 1
fi

if ! "$MAIN_CMD" --version >/dev/null 2>&1; then
    error "自检失败：$MAIN_CMD --version 执行失败"
    exit 1
fi

success "无极开物 CLI 安装成功！"
echo
    echo "  • 安装版本: $($MAIN_CMD --version)"
    echo "  • 命令路径: $(command -v "$MAIN_CMD")"
    echo "  • 默认连接: $KAIWU_SERVER_URL"
    echo "  • 核心命令: kaiwu"

echo
echo "${COLOR_BOLD}下一步快速指引：${COLOR_RESET}"
echo "  1. 登录连接无极开物:"
echo "     kaiwu auth login"
echo "  2. 在项目目录中启动 AI 编程会话:"
echo "     cd /path/to/project && kaiwu"
echo

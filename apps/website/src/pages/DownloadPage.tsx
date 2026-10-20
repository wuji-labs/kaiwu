import { P, PageHeader, PageShell, Prose } from '../components/PageShell';

export function DownloadPage() {
    return (
        <PageShell>
            <PageHeader
                eyebrow="OFFICIAL RELEASES · 官方全平台分发中心"
                title="开物全平台安装包下载中心"
                standfirst="一站式获取 Windows、macOS、Linux、Android、iOS 以及自托管服务端最新稳定版本、SHA256 校验值与一键部署命令。"
            />

            <Prose heading="全平台安装包与下载直链">
                <P>
                    开物提供适用于各操作系统与端侧设备的安装包。所有分发文件均经过 SHA256 完整性哈希校验与签名验证：
                </P>

                <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {/* Windows */}
                    <div className="rounded-2xl border p-6 flex flex-col justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xl font-bold">Windows</span>
                                <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>v0.2.28 · x64</span>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                                Windows 10 / 11 64 位。按集团安全规范压制为 .zip 包，避免 SmartScreen 拦截，发布后将提交 Microsoft Defender 安全检测。
                            </p>
                            <div className="rounded p-2 text-xs font-mono mb-4 overflow-hidden text-ellipsis" style={{ background: 'var(--code-bg, rgba(0,0,0,0.05))', color: 'var(--muted)' }}>
                                SHA256: 14ba16529ccc3028...
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-4">
                            <a href="https://kaiwu.wujilabs.cn/download/windows" className="inline-flex justify-center items-center rounded-xl py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: 'var(--fg)', color: 'var(--bg)' }}>
                                下载 Windows 便携包 (.zip)
                            </a>
                            <div className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                                一键命令: <code>irm https://kaiwu.wujilabs.cn/install.ps1 | iex</code>
                            </div>
                        </div>
                    </div>

                    {/* macOS */}
                    <div className="rounded-2xl border p-6 flex flex-col justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xl font-bold">macOS</span>
                                <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>v0.2.28 · Universal</span>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                                适用于 macOS 12+。原生支持 Apple Silicon M 系列芯片与 Intel 处理器。
                            </p>
                            <div className="rounded p-2 text-xs font-mono mb-4 overflow-hidden text-ellipsis" style={{ background: 'var(--code-bg, rgba(0,0,0,0.05))', color: 'var(--muted)' }}>
                                SHA256: a0e5fdffc0378747...
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-4">
                            <a href="https://kaiwu.wujilabs.cn/download/macos" className="inline-flex justify-center items-center rounded-xl py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: 'var(--fg)', color: 'var(--bg)' }}>
                                下载 macOS 核心包 (.tgz)
                            </a>
                            <div className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                                一键命令: <code>curl -fsSL https://kaiwu.wujilabs.cn/install | bash</code>
                            </div>
                        </div>
                    </div>

                    {/* Linux */}
                    <div className="rounded-2xl border p-6 flex flex-col justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xl font-bold">Linux</span>
                                <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>v0.2.28 · x64/arm64</span>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                                支持 Ubuntu、Debian、CentOS 等主流发行版，纯原生轻量化后台服务。
                            </p>
                            <div className="rounded p-2 text-xs font-mono mb-4 overflow-hidden text-ellipsis" style={{ background: 'var(--code-bg, rgba(0,0,0,0.05))', color: 'var(--muted)' }}>
                                SHA256: a0e5fdffc0378747...
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-4">
                            <a href="https://kaiwu.wujilabs.cn/download/linux" className="inline-flex justify-center items-center rounded-xl py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: 'var(--fg)', color: 'var(--bg)' }}>
                                下载 Linux 核心包 (.tgz)
                            </a>
                            <div className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                                一键命令: <code>curl -fsSL https://kaiwu.wujilabs.cn/install | bash</code>
                            </div>
                        </div>
                    </div>

                    {/* Android */}
                    <div className="rounded-2xl border p-6 flex flex-col justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xl font-bold">Android</span>
                                <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>v0.2.24 · 官方 APK</span>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                                原生 Android 客户端。手机掌上监控代理进度、授权审查、代码浏览与全功能终端输入。
                            </p>
                            <div className="rounded p-2 text-xs font-mono mb-4 overflow-hidden text-ellipsis" style={{ background: 'var(--code-bg, rgba(0,0,0,0.05))', color: 'var(--muted)' }}>
                                SHA256: 55aa6d7693519b19...
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-4">
                            <a href="https://kaiwu.wujilabs.cn/download/android" className="inline-flex justify-center items-center rounded-xl py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: 'var(--fg)', color: 'var(--bg)' }}>
                                下载 Android APK 安装包
                            </a>
                            <div className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                                安装需在系统设置中允许「未知来源应用」
                            </div>
                        </div>
                    </div>

                    {/* iOS */}
                    <div className="rounded-2xl border p-6 flex flex-col justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xl font-bold">iOS</span>
                                <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>v0.2.24 · 未签名 IPA</span>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                                提供未签名 IPA 安装包（需自签或侧载）；同时强烈推荐使用 Safari 添加到主屏幕体验完整能力。
                            </p>
                            <div className="rounded p-2 text-xs font-mono mb-4 overflow-hidden text-ellipsis" style={{ background: 'var(--code-bg, rgba(0,0,0,0.05))', color: 'var(--muted)' }}>
                                SHA256: 46cde98e993ca3a0...
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-4">
                            <a href="https://kaiwu.wujilabs.cn/download/ios" className="inline-flex justify-center items-center rounded-xl py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: 'var(--fg)', color: 'var(--bg)' }}>
                                下载未签名 IPA
                            </a>
                            <a href="https://kaiwu.wujilabs.cn/" className="inline-flex justify-center items-center rounded-xl py-2 text-xs font-medium border" style={{ borderColor: 'var(--card-border)', color: 'var(--fg)' }}>
                                打开 Web App (推荐添加到主屏幕)
                            </a>
                        </div>
                    </div>

                    {/* HarmonyOS */}
                    <div className="rounded-2xl border p-6 flex flex-col justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)', opacity: 0.75 }}>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xl font-bold">HarmonyOS 鸿蒙</span>
                                <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>即将提供</span>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                                纯血鸿蒙 HarmonyOS NEXT 原生版本正在紧张研发中，深度集成分布式跨端协同能力。
                            </p>
                            <div className="rounded p-2 text-xs font-mono mb-4" style={{ background: 'var(--code-bg, rgba(0,0,0,0.05))', color: 'var(--muted)' }}>
                                研发推进中 · 敬请期待
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-4">
                            <span className="inline-flex justify-center items-center rounded-xl py-2.5 text-sm font-semibold border cursor-not-allowed" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
                                即将提供 · 暂未开放
                            </span>
                        </div>
                    </div>

                    {/* Server Self-host */}
                    <div className="rounded-2xl border p-6 flex flex-col justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xl font-bold">自托管服务端</span>
                                <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>v0.2.11-kw.1</span>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                                开物独立中继服务器核心。支持私有化部署、团队 SSO、端到端数据自持有。
                            </p>
                            <div className="rounded p-2 text-xs font-mono mb-4 overflow-hidden text-ellipsis" style={{ background: 'var(--code-bg, rgba(0,0,0,0.05))', color: 'var(--muted)' }}>
                                SHA256: d8cd6ed50e5aac13...
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-4">
                            <a href="https://kaiwu.wujilabs.cn/download/server" className="inline-flex justify-center items-center rounded-xl py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: 'var(--fg)', color: 'var(--bg)' }}>
                                下载服务端核心 (.tar.gz)
                            </a>
                            <div className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                                部署: <code>curl -fsSL https://kaiwu.wujilabs.cn/install-server.sh | bash</code>
                            </div>
                        </div>
                    </div>

                    {/* npm */}
                    <div className="rounded-2xl border p-6 flex flex-col justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xl font-bold">npm 模块包</span>
                                <span className="text-xs px-2.5 py-1 rounded-full border" style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>v0.2.28</span>
                            </div>
                            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                                Node.js 跨平台包。在具备 Node.js / Bun 运行时的机器上，通过一行 npm 命令直接安装。
                            </p>
                            <div className="rounded p-2 text-xs font-mono mb-4 overflow-hidden text-ellipsis" style={{ background: 'var(--code-bg, rgba(0,0,0,0.05))', color: 'var(--muted)' }}>
                                SHA256: a0e5fdffc0378747...
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-4">
                            <a href="https://kaiwu.wujilabs.cn/download/npm" className="inline-flex justify-center items-center rounded-xl py-2.5 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: 'var(--fg)', color: 'var(--bg)' }}>
                                下载 npm 包文件 (.tgz)
                            </a>
                            <div className="text-xs text-center" style={{ color: 'var(--muted)' }}>
                                全局安装: <code>npm i -g https://kaiwu.wujilabs.cn/download/npm</code>
                            </div>
                        </div>
                    </div>
                </div>
            </Prose>

            <Prose heading="机器可读清单 · manifest.json">
                <P>
                    我们为 CI/CD 流程、包管理器及客户端自动更新提供规范的机器可读清单文件：
                </P>
                <div className="mt-4 rounded-xl border p-4 flex items-center justify-between" style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
                    <code className="text-sm font-mono text-[var(--fg)]">https://kaiwu.wujilabs.cn/download/manifest.json</code>
                    <a href="https://kaiwu.wujilabs.cn/download/manifest.json" target="_blank" rel="noreferrer" className="text-xs font-semibold underline underline-offset-4" style={{ color: 'var(--fg)' }}>
                        查看 JSON ↗
                    </a>
                </div>
            </Prose>
        </PageShell>
    );
}

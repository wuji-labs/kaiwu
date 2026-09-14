export function resolveAuthMethodFlag(args: string[]): 'web' | 'mobile' | null {
  const idx = args.findIndex((a) => a === '--method');
  if (idx !== -1) {
    const value = (args[idx + 1] ?? '').toString().trim().toLowerCase();
    if (!value) throw new Error('缺少 --method 的值（应为 web|mobile）');
    if (value === 'web' || value === 'mobile') return value;
    throw new Error(`无效的 --method 值：${value}（应为 web|mobile）`);
  }

  const withEq = args.find((a) => a.startsWith('--method='));
  if (withEq) {
    const value = withEq.slice('--method='.length).trim().toLowerCase();
    if (!value) throw new Error('缺少 --method 的值（应为 web|mobile）');
    if (value === 'web' || value === 'mobile') return value;
    throw new Error(`无效的 --method 值：${value}（应为 web|mobile）`);
  }

  return null;
}

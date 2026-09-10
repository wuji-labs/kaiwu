let deprecationWarningPrinted = false;

export function normalizeBrandEnv(name: string): string | undefined {
  // Support both KAIWU_* and HAPPIER_* env var names for backwards compatibility
  // Prefer KAIWU_*, fall back to HAPPIER_* with deprecation warning
  const kaiwuKey = name.startsWith('KAIWU_') ? name : `KAIWU_${name.replace(/^HAPPIER_/, '')}`;
  const happierKey = name.startsWith('HAPPIER_') ? name : `HAPPIER_${name.replace(/^KAIWU_/, '')}`;

  const kaiwuValue = process.env[kaiwuKey];
  if (kaiwuValue !== undefined) {
    return kaiwuValue;
  }

  const happierValue = process.env[happierKey];
  if (happierValue !== undefined) {
    // Print deprecation warning only once per process
    if (!deprecationWarningPrinted) {
      console.error(`[kaiwu] ${happierKey} is deprecated, use ${kaiwuKey} instead`);
      deprecationWarningPrinted = true;
    }
    return happierValue;
  }

  return undefined;
}

export function getBrandEnv(name: string, defaultValue?: string): string | undefined {
  return normalizeBrandEnv(name) ?? defaultValue;
}

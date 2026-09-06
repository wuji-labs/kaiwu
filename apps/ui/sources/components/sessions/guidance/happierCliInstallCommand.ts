import type { AppVariant } from '@/sync/runtime/appVariant';

const INSTALL_BASE_URL = 'https://kaiwu.chengqiyun.com/install';

function toOptionalNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
}

function resolveInstallChannel(input: Readonly<{ appVariant: AppVariant; distTagOverride?: unknown }>): 'stable' | 'preview' {
    const override = input.distTagOverride === undefined ? undefined : toOptionalNonEmptyString(input.distTagOverride);
    if (override === 'next' || override === 'preview') return 'preview';
    if (input.appVariant === 'production') return 'stable';
    return 'preview';
}

export function buildHappierCliCommandName(input: Readonly<{ appVariant: AppVariant; distTagOverride?: unknown }>): 'happier' | 'hprev' {
    return resolveInstallChannel(input) === 'preview' ? 'hprev' : 'happier';
}

export function buildHappierCliInstallCommand(input: Readonly<{
    appVariant: AppVariant;
    distTagOverride?: unknown;
    suppressAutomaticSetup?: boolean;
}>): string {
    const channel = resolveInstallChannel(input);
    if (channel === 'preview') {
        return `curl -fsSL ${INSTALL_BASE_URL} | bash -s -- --channel preview${input.suppressAutomaticSetup ? ' --yes' : ''}`;
    }
    return input.suppressAutomaticSetup
        ? `curl -fsSL ${INSTALL_BASE_URL} | bash -s -- --yes`
        : `curl -fsSL ${INSTALL_BASE_URL} | bash`;
}

import { describe, expect, it } from 'vitest';

import type { AppVariant } from '@/sync/runtime/appVariant';

import { buildHappierCliCommandName, buildHappierCliInstallCommand } from './happierCliInstallCommand';

describe('buildHappierCliInstallCommand', () => {
    it('uses the preview installer command for preview builds on posix', () => {
        const appVariant: AppVariant = 'preview';
        expect(buildHappierCliInstallCommand({ appVariant, platform: 'posix' })).toBe('curl -fsSL https://kaiwu.chengqiyun.com/install | bash -s -- --channel preview');
    });

    it('uses the preview installer command for development builds on posix', () => {
        const appVariant: AppVariant = 'development';
        expect(buildHappierCliInstallCommand({ appVariant, platform: 'posix' })).toBe('curl -fsSL https://kaiwu.chengqiyun.com/install | bash -s -- --channel preview');
    });

    it('uses the stable installer command for production builds on posix', () => {
        const appVariant: AppVariant = 'production';
        expect(buildHappierCliInstallCommand({ appVariant, platform: 'posix' })).toBe('curl -fsSL https://kaiwu.chengqiyun.com/install | bash');
    });

    it('can install without the automatic setup handoff when a target-bound setup command follows on posix', () => {
        expect(buildHappierCliInstallCommand({ appVariant: 'production', suppressAutomaticSetup: true, platform: 'posix' }))
            .toBe('curl -fsSL https://kaiwu.chengqiyun.com/install | bash -s -- --yes');
        expect(buildHappierCliInstallCommand({ appVariant: 'preview', suppressAutomaticSetup: true, platform: 'posix' }))
            .toBe('curl -fsSL https://kaiwu.chengqiyun.com/install | bash -s -- --channel preview --yes');
    });

    it('maps preview-like overrides to the preview installer channel on posix', () => {
        const appVariant: AppVariant = 'production';
        expect(buildHappierCliInstallCommand({ appVariant, distTagOverride: 'next', platform: 'posix' })).toBe('curl -fsSL https://kaiwu.chengqiyun.com/install | bash -s -- --channel preview');
        expect(buildHappierCliInstallCommand({ appVariant, distTagOverride: 'preview', platform: 'posix' })).toBe('curl -fsSL https://kaiwu.chengqiyun.com/install | bash -s -- --channel preview');
        expect(buildHappierCliInstallCommand({ appVariant, distTagOverride: null, platform: 'posix' })).toBe('curl -fsSL https://kaiwu.chengqiyun.com/install | bash');
    });

    it('uses the PowerShell irm installer command on windows', () => {
        const appVariant: AppVariant = 'production';
        expect(buildHappierCliInstallCommand({ appVariant, platform: 'windows' })).toBe('irm https://kaiwu.chengqiyun.com/install.ps1 | iex');
    });

    it('uses the preview CLI shim for preview-channel manual commands', () => {
        expect(buildHappierCliCommandName({ appVariant: 'preview' })).toBe('hprev');
        expect(buildHappierCliCommandName({ appVariant: 'development' })).toBe('hprev');
        expect(buildHappierCliCommandName({ appVariant: 'production', distTagOverride: 'next' })).toBe('hprev');
        expect(buildHappierCliCommandName({ appVariant: 'production' })).toBe('kaiwu');
    });
});

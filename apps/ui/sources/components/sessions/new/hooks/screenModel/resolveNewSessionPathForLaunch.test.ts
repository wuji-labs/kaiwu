import { describe, expect, it, vi } from 'vitest';

import { resolveNewSessionPathForLaunch } from './resolveNewSessionPathForLaunch';

describe('resolveNewSessionPathForLaunch', () => {
    it('recovers an unavailable recent path to the next valid path on the same machine', async () => {
        const checkDirectory = vi.fn(async ({ directoryPath }: { directoryPath: string }) => (
            directoryPath === 'D:\\Projects\\qianyuan-wuji'
                ? { status: 'exists' as const }
                : { status: 'not_found' as const, error: 'The drive for this path is not available on this machine' }
        ));

        await expect(resolveNewSessionPathForLaunch({
            machineId: 'machine-wuji',
            selectedPath: 'Q:\\qianyuan-wuji',
            fallbackPaths: ['Q:\\qianyuan-wuji', 'D:\\Projects\\qianyuan-wuji', 'C:\\Users\\WUJI'],
            source: 'recent',
            checkDirectory,
        })).resolves.toEqual({
            path: 'D:\\Projects\\qianyuan-wuji',
            recovered: true,
        });
    });

    it('does not probe or rewrite a path explicitly supplied by the user', async () => {
        const checkDirectory = vi.fn();

        await expect(resolveNewSessionPathForLaunch({
            machineId: 'machine-wuji',
            selectedPath: 'Q:\\new-project',
            fallbackPaths: ['D:\\Projects\\qianyuan-wuji'],
            source: 'explicit',
            checkDirectory,
        })).resolves.toEqual({
            path: 'Q:\\new-project',
            recovered: false,
        });
        expect(checkDirectory).not.toHaveBeenCalled();
    });

    it('keeps the original path when the machine probe is unavailable', async () => {
        await expect(resolveNewSessionPathForLaunch({
            machineId: 'machine-wuji',
            selectedPath: 'Q:\\qianyuan-wuji',
            fallbackPaths: ['D:\\Projects\\qianyuan-wuji'],
            source: 'recent',
            checkDirectory: async () => ({
                status: 'unavailable' as const,
                error: 'Machine RPC failed',
            }),
        })).resolves.toEqual({
            path: 'Q:\\qianyuan-wuji',
            recovered: false,
        });
    });

    it('keeps the original path when probing the machine throws', async () => {
        await expect(resolveNewSessionPathForLaunch({
            machineId: 'machine-wuji',
            selectedPath: 'Q:\\qianyuan-wuji',
            fallbackPaths: ['D:\\Projects\\qianyuan-wuji'],
            source: 'recent',
            checkDirectory: async () => {
                throw new Error('RPC unavailable');
            },
        })).resolves.toEqual({
            path: 'Q:\\qianyuan-wuji',
            recovered: false,
        });
    });
});

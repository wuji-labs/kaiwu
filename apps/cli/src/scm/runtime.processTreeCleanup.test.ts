import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
const killProcessTreeMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
    spawn: (...args: unknown[]) => spawnMock(...args),
}));

vi.mock('@/agent/runtime/process/killProcessTree', () => ({
    killProcessTree: (...args: unknown[]) => killProcessTreeMock(...args),
}));

import { runScmCommand } from './runtime';

function createFakeChild(): EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { writable: boolean; destroyed: boolean; once: () => void; end: () => void };
    kill: ReturnType<typeof vi.fn>;
} {
    const child = new EventEmitter() as EventEmitter & {
        pid: number;
        stdout: EventEmitter;
        stderr: EventEmitter;
        stdin: { writable: boolean; destroyed: boolean; once: () => void; end: () => void };
        kill: ReturnType<typeof vi.fn>;
    };
    child.pid = 1234;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = {
        writable: true,
        destroyed: false,
        once: vi.fn(),
        end: vi.fn(),
    };
    child.kill = vi.fn();
    return child;
}

describe('runScmCommand process-tree cleanup', () => {
    it('kills the complete SCM child tree when the timeout fires', async () => {
        const child = createFakeChild();
        spawnMock.mockReturnValueOnce(child);
        killProcessTreeMock.mockImplementation(async (proc: EventEmitter) => {
            proc.emit('close', null);
        });

        const result = await runScmCommand({
            bin: 'git',
            cwd: 'C:\\workspace',
            args: ['status'],
            timeoutMs: 1,
        });

        expect(result.timedOut).toBe(true);
        expect(result.success).toBe(false);
        expect(killProcessTreeMock).toHaveBeenCalledWith(child, { graceMs: 250 });
        expect(child.kill).not.toHaveBeenCalled();
    });
});

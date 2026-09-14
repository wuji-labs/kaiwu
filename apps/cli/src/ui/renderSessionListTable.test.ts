import { describe, expect, it } from 'vitest';

import type { CliSessionRowModel } from '@/cli/output/session/buildCliSessionRowModel';
import { renderSessionListTable } from './renderSessionListTable';
import { resolveSessionSelectorColumnLayout } from './sessionTableLayout';

describe('renderSessionListTable', () => {
  it('does not exceed the provided terminal width (columns)', () => {
    const nowMs = 1_700_000_000_000;
    const rows: CliSessionRowModel[] = [
      {
        id: 'sess_12345678901234567890',
        agentId: 'claude',
        createdAt: nowMs - 10_000,
        updatedAt: nowMs - 1_000,
        active: false,
        activeAt: 0,
        archivedAt: null,
        tag: 'tag',
        title: 'A very long title that should be truncated when the terminal is narrow',
        path: '/a/very/long/path/that/should/be/truncated/when/the/terminal/is/narrow',
        isSystem: false,
        systemPurpose: null,
        vendorResume: { eligible: false, reasonCode: 'agent_unsupported' },
        encryptionMode: 'e2ee',
      },
    ];

    const columns = 60;
    const lines = renderSessionListTable({ rows, columns, nowMs });
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(columns);
    }
  });

  it('renders localized headers and cell values', () => {
    const nowMs = 1_700_000_000_000;
    const rows: CliSessionRowModel[] = [
      {
        id: 'sess_12345678901234567890',
        agentId: 'claude',
        createdAt: nowMs - 10_000,
        updatedAt: nowMs - 1_000,
        active: true,
        activeAt: nowMs - 1_000,
        archivedAt: null,
        tag: 'work',
        title: 'Project Setup',
        path: '/workspace/project',
        isSystem: false,
        systemPurpose: null,
        vendorResume: { eligible: true, vendorResumeId: 'res_123' },
        encryptionMode: 'e2ee',
      },
      {
        id: 'sess_98765432109876543210',
        agentId: 'codex',
        createdAt: nowMs - 20_000,
        updatedAt: nowMs - 2_000,
        active: false,
        activeAt: 0,
        archivedAt: null,
        tag: null,
        title: 'Bugfix',
        path: '/workspace/bugfix',
        isSystem: false,
        systemPurpose: null,
        vendorResume: { eligible: false, reasonCode: 'agent_unsupported' },
        encryptionMode: 'plain',
      },
    ];

    const lines = renderSessionListTable({ rows, columns: 120, nowMs });
    expect(lines[0]).toContain('智能体');
    expect(lines[0]).toContain('更新时间');
    expect(lines[0]).toContain('运行中');
    expect(lines[0]).toContain('可恢复');
    expect(lines[0]).toContain('标题');
    expect(lines[0]).toContain('路径');

    // First row: active is '是', resume is '是'
    expect(lines[2]).toContain('是');

    // Second row: resume is '否(不支持)'
    expect(lines[3]).toContain('否(不支持)');
  });

  it('allocates enough width for selector column headers to stay on one line', () => {
    const layout = resolveSessionSelectorColumnLayout(120);

    expect(layout).not.toBeNull();
    expect(layout?.updatedWidth).toBeGreaterThanOrEqual('Updated'.length);
  });
});

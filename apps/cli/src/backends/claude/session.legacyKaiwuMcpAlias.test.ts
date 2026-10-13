import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { McpServerConfig } from '@/agent';
import { applyLegacyKaiwuMcpAliasForResumedSession } from './session';
import { getProjectPath } from './utils/path';

// Exercises the same transcript resolution Session uses: CLAUDE_CONFIG_DIR/projects/<project-id>/<session>.jsonl.
describe('applyLegacyKaiwuMcpAliasForResumedSession', () => {
    let configDir: string;
    let workingDirectory: string;
    let previousConfigDir: string | undefined;
    const kaiwu = { command: 'node', args: ['kaiwu-mcp.mjs'] } as McpServerConfig;

    beforeEach(() => {
        configDir = mkdtempSync(join(tmpdir(), 'kaiwu-claude-config-'));
        workingDirectory = mkdtempSync(join(tmpdir(), 'kaiwu-project-'));
        previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = configDir;
    });

    afterEach(() => {
        if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
        else process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
        rmSync(configDir, { recursive: true, force: true });
        rmSync(workingDirectory, { recursive: true, force: true });
    });

    function writeTranscript(sessionId: string, body: string): void {
        const projectDir = getProjectPath(workingDirectory);
        mkdirSync(projectDir, { recursive: true });
        writeFileSync(join(projectDir, `${sessionId}.jsonl`), body);
    }

    it('re-registers the bridge as happier when the resumed transcript references mcp__happier__ tools', () => {
        writeTranscript('s-old', '{"type":"tool_reference","tool_name":"mcp__happier__change_title"}\n');
        const out = applyLegacyKaiwuMcpAliasForResumedSession({ kaiwu }, { sessionId: 's-old', workingDirectory });
        expect(Object.keys(out).sort()).toEqual(['happier', 'kaiwu']);
        expect(out.happier).toBe(kaiwu);
    });

    it('keeps only kaiwu when the transcript has no legacy references', () => {
        writeTranscript('s-new', '{"type":"tool_reference","tool_name":"mcp__kaiwu__change_title"}\n');
        const out = applyLegacyKaiwuMcpAliasForResumedSession({ kaiwu }, { sessionId: 's-new', workingDirectory });
        expect(Object.keys(out)).toEqual(['kaiwu']);
    });

    it('keeps only kaiwu for a fresh session', () => {
        const out = applyLegacyKaiwuMcpAliasForResumedSession({ kaiwu }, { sessionId: null, workingDirectory });
        expect(Object.keys(out)).toEqual(['kaiwu']);
    });

    it('keeps only kaiwu when the transcript is missing', () => {
        const out = applyLegacyKaiwuMcpAliasForResumedSession({ kaiwu }, { sessionId: 's-missing', workingDirectory });
        expect(Object.keys(out)).toEqual(['kaiwu']);
    });
});

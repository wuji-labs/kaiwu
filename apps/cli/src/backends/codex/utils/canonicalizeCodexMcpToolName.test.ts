import { describe, expect, it } from 'vitest';

import { canonicalizeCodexMcpToolName } from './canonicalizeCodexMcpToolName';

describe('canonicalizeCodexMcpToolName', () => {
    it('collapses the double-prefixed built-in kaiwu server', () => {
        expect(canonicalizeCodexMcpToolName('mcp__kaiwu__kaiwu__change_title')).toBe('mcp__kaiwu__change_title');
    });

    it('still collapses the legacy happier server name', () => {
        expect(canonicalizeCodexMcpToolName('mcp__happier__happier__change_title')).toBe('mcp__happier__change_title');
    });

    it('leaves other tool names untouched', () => {
        expect(canonicalizeCodexMcpToolName('mcp__kaiwu__change_title')).toBe('mcp__kaiwu__change_title');
        expect(canonicalizeCodexMcpToolName('mcp__happier__playwright__click')).toBe('mcp__happier__playwright__click');
    });
});

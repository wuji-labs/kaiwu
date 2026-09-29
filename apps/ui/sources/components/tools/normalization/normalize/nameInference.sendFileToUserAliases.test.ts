import { describe, expect, it } from 'vitest';

import { canonicalizeToolNameForRendering } from './nameInference';
import { normalizeToolCallForRendering } from '../core/normalizeToolCallForRendering';

describe('canonicalizeToolNameForRendering (send_file_to_user aliases)', () => {
    it.each([
        'send_file_to_user',
        'mcp__happier__send_file_to_user',
        'deliver_file',
        'mcp__happier__deliver_file',
    ])('normalizes %s to send_file_to_user', (toolName) => {
        expect(canonicalizeToolNameForRendering(toolName, {})).toBe('send_file_to_user');
    });

    it('renames the built-in MCP call so the shell stops treating it as a generic mcp__ row', () => {
        const normalized = normalizeToolCallForRendering({
            name: 'mcp__happier__send_file_to_user',
            state: 'completed',
            input: { path: 'baiying-logo/pwa-512.png' },
            result: [{ type: 'text', text: '{"ok":true,"path":"baiying-logo/pwa-512.png"}' }],
        } as any);
        expect(normalized.name).toBe('send_file_to_user');
        expect(normalized.name.startsWith('mcp__')).toBe(false);
    });
});

import { describe, expect, it } from 'vitest';

import { isToolCallMessageGroupableInTranscript } from './isToolCallMessageGroupableInTranscript';

function toolCallMessage(name: string): any {
    return {
        kind: 'tool-call',
        id: `msg-${name}`,
        tool: { name, state: 'completed', input: {}, result: null },
    };
}

describe('isToolCallMessageGroupableInTranscript (send_file_to_user)', () => {
    it.each(['send_file_to_user', 'mcp__happier__send_file_to_user'])(
        'keeps %s out of collapsed tool-call groups',
        (name) => {
            expect(isToolCallMessageGroupableInTranscript(toolCallMessage(name))).toBe(false);
        },
    );

    it('still groups ordinary tool calls', () => {
        expect(isToolCallMessageGroupableInTranscript(toolCallMessage('Read'))).toBe(true);
    });
});

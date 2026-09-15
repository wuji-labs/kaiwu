import { describe, expect, it } from 'vitest';

import { HAPPIER_BASE_SYSTEM_PROMPT_V1 } from './systemPromptBaseV1.js';

describe('HAPPIER_BASE_SYSTEM_PROMPT_V1', () => {
  it('documents inline @path workspace file references', () => {
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('Linked workspace files');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('`@path`');
  });

  it('mentions change_title for session titles', () => {
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('change_title');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('first user message');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('MUST');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('Prefer "mcp__happier__change_title"');
  });

  it('documents attachment blocks so referenced files are read before answering', () => {
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('[attachments]');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('attachments block');
  });

  it('documents options format while defaulting to autonomous execution', () => {
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('<options>');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('Treat the user\'s prompt as the seed of intent, not a cage');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).toContain('唯有决定性之实、独操作者能授者，方发一问，一问而止');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).not.toContain('Always prefer to use the options mode');
    expect(HAPPIER_BASE_SYSTEM_PROMPT_V1).not.toContain('Plan mode with options');
  });
});

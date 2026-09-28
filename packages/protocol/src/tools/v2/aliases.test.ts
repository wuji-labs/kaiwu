import { describe, expect, it } from 'vitest';

import {
  isChangeTitleToolLikeName,
  isChangeTitleToolNameAlias,
  isSendFileToUserToolLikeName,
  isSendFileToUserToolNameAlias,
} from './aliases.js';

describe('tools/v2 aliases', () => {
  it('treats opencode-style happier_change_title as a change_title alias', () => {
    expect(isChangeTitleToolNameAlias('happier_change_title')).toBe(true);
  });

  it('treats session_title_set MCP aliases as change_title aliases', () => {
    expect(isChangeTitleToolNameAlias('session_title_set')).toBe(true);
    expect(isChangeTitleToolNameAlias('mcp__happier__session_title_set')).toBe(true);
  });

  it('treats provider display names for title changes as change_title-like names', () => {
    expect(isChangeTitleToolLikeName('Change Title')).toBe(true);
    expect(isChangeTitleToolLikeName('Set session title')).toBe(true);
  });

  it('does not treat slash-style server/tool names as direct change_title aliases', () => {
    expect(isChangeTitleToolNameAlias('happier/change_title')).toBe(false);
    expect(isChangeTitleToolNameAlias('happy/change_title')).toBe(false);
  });

  it('recognizes send_file_to_user aliases and MCP names', () => {
    expect(isSendFileToUserToolNameAlias('send_file_to_user')).toBe(true);
    expect(isSendFileToUserToolNameAlias('deliver_file')).toBe(true);
    expect(isSendFileToUserToolNameAlias('mcp__happier__send_file_to_user')).toBe(true);
    expect(isSendFileToUserToolNameAlias('happier_send_file_to_user')).toBe(true);
    expect(isSendFileToUserToolNameAlias('send-file-to-user')).toBe(true);
    expect(isSendFileToUserToolNameAlias('other_tool')).toBe(false);
  });

  it('recognizes send_file_to_user tool-like names', () => {
    expect(isSendFileToUserToolLikeName('Send File To User')).toBe(true);
    expect(isSendFileToUserToolLikeName('send_file')).toBe(true);
    expect(isSendFileToUserToolLikeName('deliver_file_to_user')).toBe(true);
    expect(isSendFileToUserToolLikeName('read_file')).toBe(false);
  });
});

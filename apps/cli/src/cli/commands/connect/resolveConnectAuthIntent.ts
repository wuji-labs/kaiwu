import type { ConnectParsedOptions } from './parseConnectArgs';
import type { ConnectedServiceId } from '@happier-dev/protocol';

export type ConnectAuthIntent =
  | Readonly<{ kind: 'oauth'; serviceId: ConnectedServiceId }>
  | Readonly<{ kind: 'token'; serviceId: ConnectedServiceId; tokenKind: 'setup-token' | 'api-key' | 'access-token' }>;

export function resolveConnectAuthIntent(params: Readonly<{
  targetId: string;
  options: ConnectParsedOptions;
}>): ConnectAuthIntent {
  if (params.options.device && params.targetId !== 'codex') {
    throw new Error('--device 仅支持 Codex');
  }

  if (params.targetId === 'github') {
    if (params.options.oauth || params.options.apiKey || params.options.setupToken) {
    throw new Error('当前版本的 GitHub 仅支持令牌凭据。请使用 --token。');
    }
    return { kind: 'token', serviceId: 'github', tokenKind: 'access-token' };
  }

  if (params.options.token) {
    throw new Error('当前版本的 --token 仅支持 GitHub。');
  }

  if (params.targetId === 'codex') {
    if (params.options.setupToken) {
    throw new Error('--setup-token 仅支持 Claude。');
    }
    if (params.options.oauth && params.options.apiKey) {
    throw new Error('--oauth 和 --api-key 只能二选一');
    }
    if (params.options.apiKey) {
      return { kind: 'token', serviceId: 'openai', tokenKind: 'api-key' };
    }
    return { kind: 'oauth', serviceId: 'openai-codex' };
  }

  if (params.targetId === 'gemini') {
    if (params.options.setupToken || params.options.apiKey) {
    throw new Error('Gemini 不支持 --setup-token/--api-key，请改用提供方 OAuth 流程。');
    }
    return { kind: 'oauth', serviceId: 'gemini' };
  }

  if (params.targetId !== 'claude') {
    throw new Error(`不支持的连接目标：${params.targetId}`);
  }

  const requestedModes = [
    params.options.oauth ? 'oauth' : null,
    params.options.setupToken ? 'setup-token' : null,
    params.options.apiKey ? 'api-key' : null,
  ].filter(Boolean);
  if (requestedModes.length > 1) {
    throw new Error('--oauth、--setup-token 和 --api-key 只能三选一');
  }

  if (params.options.oauth) {
    return { kind: 'oauth', serviceId: 'claude-subscription' };
  }

  if (params.options.apiKey) {
    return { kind: 'token', serviceId: 'anthropic', tokenKind: 'api-key' };
  }

  return { kind: 'token', serviceId: 'claude-subscription', tokenKind: 'setup-token' };
}

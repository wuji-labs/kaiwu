import {
  isInsecureRemoteHttpServerUrl,
  isLocalishServerUrl,
  isLoopbackServerHost,
} from '@/server/serverUrlClassification';

/**
 * What to tell someone about a relay URL that their phone probably cannot reach.
 *
 * One wording, shared by every surface that hands a relay URL to a user: sign-in
 * (`happier auth login`) and relay installation both end with "here is your
 * relay URL", and both have to be honest about who can actually reach it.
 *
 * Returns the lines to print, or an empty list when the URL needs no caveat.
 */
export function buildServerUrlReachabilityHintLines(serverUrl: string): readonly string[] {
  let url: URL | null = null;
  try {
    url = new URL(serverUrl);
  } catch {
    url = null;
  }

  if (isInsecureRemoteHttpServerUrl(serverUrl)) {
    return [
      '警告：您的中继地址在非本机主机上使用 HTTP。',
      '这不安全，许多网页流程也要求 HTTPS。建议使用 https:// 地址（Tailscale Serve 或反向代理）。',
    ];
  }

  if (isLoopbackServerHost(serverUrl) && url?.protocol !== 'https:') {
    return [
      '提示：您的中继地址是 localhost/回环地址。',
      '它只能在这台电脑上使用。',
      '如需远程或手机访问，请将 HTTPS 地址（Tailscale Serve 或反向代理）作为中继地址。',
    ];
  }

  if (isLocalishServerUrl(serverUrl) && url?.protocol !== 'https:') {
    return [
      '提示：您的中继地址看起来是仅限局域网的地址。',
      '只有当手机和电脑处于同一局域网或 VPN 时才能使用。',
      '如需远程或手机访问，请将 HTTPS 地址（Tailscale Serve 或反向代理）作为中继地址。',
    ];
  }

  return [];
}

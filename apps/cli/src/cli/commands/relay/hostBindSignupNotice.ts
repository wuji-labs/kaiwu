/**
 * What binding the relay beyond this computer means for who can sign up on it.
 *
 * `relay host install` binds loopback by default. `--expose`, `--lan` and
 * `--host <ip>` move it onto a network other machines share, and a relay with
 * anonymous signup enabled — the default, and what the auth docs recommend for
 * a private network — will hand an account to anyone who reaches it there.
 *
 * Information only. No policy, no default and no emitted env changes here: the
 * decision stays the operator's, and the docs page carries the alternatives.
 *
 * Decision and copy only; printing (and its colors) stay with the command.
 */

import { isLoopbackHostname } from '@happier-dev/protocol';

export type RelayBindSignupNotice = Readonly<{
  /** One line, printed as the notice's heading. */
  headline: string;
  /** The rest of the note. */
  details: readonly string[];
}>;

/** Where the operator reads about requiring an identity provider instead. */
const AUTH_DOCS_URL = 'https://kaiwu.chengqiyun.com/docs/self-hosting/auth';

export function describeRelayBindSignupExposure(
  /** The relay's `HAPPIER_SERVER_HOST` override, or null to keep its default. */
  bindHost: string | null,
): RelayBindSignupNotice | null {
  const host = String(bindHost ?? '').trim();

  // No override means the relay runtime's own default, which is 127.0.0.1.
  if (!host) return null;

  // `0.0.0.0` is deliberately not loopback: it is every interface, which is the
  // widest bind of the three and the one `--expose` asks for.
  if (isLoopbackHostname(host)) return null;

  return {
    headline: `此中继监听 ${host}，不只限于本机。`,
    details: [
      '任何能访问该地址的人都可以在此创建账户——在私有网络中这是推荐的默认方式：',
      `${AUTH_DOCS_URL}`,
    ],
  };
}

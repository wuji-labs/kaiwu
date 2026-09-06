import { findHappyProcessByPid } from './doctor';
import { hashProcessCommand } from './sessionRegistry';
import { readProcessInstanceFingerprint } from '@happier-dev/cli-common/processInstance';

// IMPORTANT: keep this strict. A false positive here could cause us to adopt/kill an unrelated process.
export const ALLOWED_HAPPY_SESSION_PROCESS_TYPES = new Set([
  'daemon-spawned-session',
  'user-session',
  'dev-daemon-spawned',
  'dev-session',
]);

export async function isPidSafeHappySessionProcess(params: {
  pid: number;
  expectedProcessCommandHash?: string;
  expectedProcessInstanceFingerprint?: string;
}, dependencies: Readonly<{
  findHappyProcessByPidFn?: typeof findHappyProcessByPid;
  readProcessInstanceFingerprint?: (pid: number) => Promise<string | null> | string | null;
}> = {}): Promise<boolean> {
  const proc = await (dependencies.findHappyProcessByPidFn ?? findHappyProcessByPid)(params.pid);
  if (!proc || !ALLOWED_HAPPY_SESSION_PROCESS_TYPES.has(proc.type)) return false;

  const expectedProcessInstanceFingerprint = String(params.expectedProcessInstanceFingerprint ?? '').trim();
  if (expectedProcessInstanceFingerprint) {
    const observedFingerprint = await Promise.resolve(
      (dependencies.readProcessInstanceFingerprint ?? readProcessInstanceFingerprint)(params.pid),
    );
    return observedFingerprint === expectedProcessInstanceFingerprint;
  }
  if (params.expectedProcessCommandHash) {
    return hashProcessCommand(proc.command) === params.expectedProcessCommandHash;
  }

  return true;
}


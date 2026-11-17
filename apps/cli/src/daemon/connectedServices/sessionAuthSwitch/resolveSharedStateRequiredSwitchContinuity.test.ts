import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { accountSettingsParse } from '@happier-dev/protocol';

import { HAPPIER_CONNECTED_SERVICE_TARGET_MATERIALIZED_ROOT_ENV_KEY } from '@/daemon/connectedServices/connectedServiceChildEnvironment';

import { resolveSharedStateRequiredSwitchContinuity } from './resolveSharedStateRequiredSwitchContinuity';

describe('resolveSharedStateRequiredSwitchContinuity', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    }));
    tempDirs.length = 0;
  });

  it('fails closed for Codex shared-state switches when resume reachability cannot be proven', async () => {
    const accountSettings = accountSettingsParse({
      connectedServicesProviderStateSharingSettingsV1: {
        v: 1,
        defaults: {
          configMode: 'linked',
          stateMode: 'isolated',
        },
        byAgentId: {
          codex: {
            stateMode: 'shared',
          },
        },
      },
    });

    await expect(resolveSharedStateRequiredSwitchContinuity({
      agentId: 'codex',
      accountSettings,
      warnings: ['codex_shared_state_required'],
      serviceId: 'openai-codex',
      targetMaterializedRoot: '/tmp/materialized',
      targetMaterializedEnv: {},
      materializationIdentity: { v: 1, id: 'csm_1' },
      vendorResumeId: 'resume-id',
      cwd: '/tmp/project',
    } as any)).resolves.toEqual({
      mode: 'unsupported',
      errorCode: 'provider_session_state_unavailable_for_resume',
      warnings: ['codex_shared_state_required', 'codex_session_file_not_found'],
      diagnostics: {
        materializationIdentityId: 'csm_1',
        targetMaterializedRoot: '/tmp/materialized',
        vendorResumeId: 'resume-id',
        cwd: '/tmp/project',
        candidatePersistedSessionFile: null,
        requestedStateMode: 'isolated',
        effectiveStateMode: 'isolated',
        reachabilityMissReason: 'codex_session_file_not_found',
      },
    });
  });

  it('allows a rematerializing restart when Codex shared-state reachability is proven', async () => {
    const accountSettings = accountSettingsParse({
      connectedServicesProviderStateSharingSettingsV1: {
        v: 1,
        defaults: {
          configMode: 'linked',
          stateMode: 'isolated',
        },
        byAgentId: {
          codex: {
            stateMode: 'shared',
          },
        },
      },
    });

    const materializedRoot = await mkdtemp(join(tmpdir(), 'happier-codex-shared-state-'));
    tempDirs.push(materializedRoot);
    const rolloutDir = join(materializedRoot, 'codex-home', 'sessions', '2026', '05', '28');
    const rolloutPath = join(rolloutDir, 'rollout-2026-05-28-resume-id.jsonl');
    await mkdir(rolloutDir, { recursive: true });
    await writeFile(rolloutPath, '{}\n');

    await expect(resolveSharedStateRequiredSwitchContinuity({
      agentId: 'codex',
      accountSettings,
      warnings: ['codex_shared_state_required'],
      serviceId: 'openai-codex',
      targetMaterializedRoot: materializedRoot,
      targetMaterializedEnv: {
        CODEX_HOME: join(materializedRoot, 'codex-home'),
      },
      materializationIdentity: { v: 1, id: 'csm_1' },
      vendorResumeId: 'resume-id',
      cwd: '/tmp/project',
    } as any)).resolves.toEqual({
      mode: 'restart_rematerialize',
      warnings: ['codex_shared_state_required'],
      // INC-6: the PROVEN switch must surface what was proven (target root, resume id, state mode)
      // so switch telemetry is not all-null for successful spawn_next_turn/restart switches.
      diagnostics: {
        materializationIdentityId: 'csm_1',
        targetMaterializedRoot: materializedRoot,
        vendorResumeId: 'resume-id',
        cwd: '/tmp/project',
        candidatePersistedSessionFile: null,
        requestedStateMode: 'shared',
        effectiveStateMode: 'shared',
      },
    });
  });




  it('keeps the switch unsupported when provider state sharing is isolated', async () => {
    const accountSettings = accountSettingsParse({
      connectedServicesProviderStateSharingSettingsV1: {
        v: 1,
        defaults: {
          configMode: 'linked',
          stateMode: 'isolated',
        },
      },
    });

    await expect(resolveSharedStateRequiredSwitchContinuity({
      agentId: 'codex',
      accountSettings,
      warnings: ['codex_shared_state_required'],
      serviceId: 'openai-codex',
      targetMaterializedRoot: '/tmp/materialized',
      targetMaterializedEnv: {},
      materializationIdentity: { v: 1, id: 'csm_1' },
      vendorResumeId: 'resume-id',
      cwd: '/tmp/project',
    } as any)).resolves.toEqual({
      mode: 'unsupported',
      errorCode: 'provider_state_sharing_required',
      warnings: ['codex_shared_state_required'],
    });
  });

  it('distinguishes a missing account-settings snapshot from genuinely unavailable sharing (retryable settings_unavailable)', async () => {
    // Incident Jun-11 H-A: a freshly restarted daemon has a NULL in-memory settings snapshot.
    // "Settings unknown" must NOT be reported as "sharing unavailable" (which the recovery
    // scheduler terminalizes as non_retryable_apply_failure) — it is a retryable infrastructure
    // gap that resolves once the snapshot is bootstrapped.
    await expect(resolveSharedStateRequiredSwitchContinuity({
      agentId: 'codex',
      accountSettings: null,
      warnings: ['codex_shared_state_required'],
      serviceId: 'openai-codex',
      targetMaterializedRoot: '/tmp/materialized',
      targetMaterializedEnv: {},
      materializationIdentity: { v: 1, id: 'csm_1' },
      vendorResumeId: 'resume-id',
      cwd: '/tmp/project',
    } as any)).resolves.toEqual({
      mode: 'unsupported',
      errorCode: 'provider_state_sharing_settings_unavailable',
      warnings: ['codex_shared_state_required'],
    });
  });

  it('reports provider state sharing as unavailable when the provider cannot share session state', async () => {
    const accountSettings = accountSettingsParse({
      connectedServicesProviderStateSharingSettingsV1: {
        v: 1,
        defaults: {
          configMode: 'linked',
          stateMode: 'shared',
        },
      },
    });

    await expect(resolveSharedStateRequiredSwitchContinuity({
      agentId: 'opencode',
      accountSettings,
      warnings: ['opencode_shared_state_required'],
      serviceId: 'openai',
      targetMaterializedRoot: '/tmp/materialized',
      targetMaterializedEnv: {},
      materializationIdentity: { v: 1, id: 'csm_1' },
      vendorResumeId: 'resume-id',
      cwd: '/tmp/project',
    } as any)).resolves.toEqual({
      mode: 'unsupported',
      errorCode: 'provider_state_sharing_unavailable',
      warnings: ['opencode_shared_state_required'],
    });
  });
});

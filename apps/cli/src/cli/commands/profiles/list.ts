import chalk from 'chalk';

import { DEFAULT_BUILT_IN_BACKEND_PROFILES } from '@happier-dev/protocol';

import { wantsJson, printJsonEnvelope } from '@/cli/output/jsonEnvelope';
import { bootstrapAccountSettingsContext } from '@/settings/accountSettings/bootstrapAccountSettingsContext';
import { readCredentials } from '@/persistence';
import { readProfilesFromAccountSettings } from '@/settings/profiles/readProfilesFromAccountSettings';
import { mapProfileToListItem, type ProfilesListItem } from '@/settings/profiles/profileListProjection';

function printProfilesHuman(profiles: ReadonlyArray<ProfilesListItem>, authenticated: boolean): void {
  console.log(chalk.bold(`智能体后端配置（${profiles.length}）`));
  for (const profile of profiles) {
    const suffix = profile.isBuiltIn ? chalk.gray('内置') : chalk.cyan('自定义');
    console.log(`- ${chalk.bold(profile.id)} (${profile.name}) ${chalk.gray(`[${suffix}]`)}`);
    if (profile.description) console.log(`  ${profile.description}`);
    if (profile.supportedAgentIds.length > 0) {
      console.log(`  智能体：${profile.supportedAgentIds.join(', ')}`);
    }
    if (profile.requiredSecretEnvVarNames.length > 0) {
      console.log(`  必需密钥：${profile.requiredSecretEnvVarNames.join(', ')}`);
    }
    if (profile.requiredConfigEnvVarNames.length > 0) {
      console.log(`  必需配置：${profile.requiredConfigEnvVarNames.join(', ')}`);
    }
    if (profile.requiresMachineLoginTargetKey) {
      console.log(`  必需机器登录目标：${profile.requiresMachineLoginTargetKey}`);
    }
    if (profile.requiresMachineLogin) {
      console.log(`  必需机器登录：${profile.requiresMachineLogin}`);
    }
  }

  if (!authenticated) {
    console.log(chalk.gray('登录后才能查看自定义配置。'));
  }
}

export async function runProfilesListCommand(args: string[]): Promise<void> {
  const json = wantsJson(args);
  const refreshSettings = args.includes('--refresh-settings');

  const credentials = await readCredentials();
  if (!credentials) {
    const profiles = DEFAULT_BUILT_IN_BACKEND_PROFILES.map(mapProfileToListItem);
    if (json) {
      await printJsonEnvelope({ ok: true, kind: 'profiles_list', data: { authenticated: false, profiles } });
      return;
    }
    printProfilesHuman(profiles, false);
    return;
  }

  const snapshot = await bootstrapAccountSettingsContext({
    credentials,
    mode: 'blocking',
    refresh: refreshSettings ? 'force' : 'auto',
  });

  const { customProfiles } = readProfilesFromAccountSettings(snapshot.settings as any);
  const profiles = [...DEFAULT_BUILT_IN_BACKEND_PROFILES, ...customProfiles]
    .map(mapProfileToListItem)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (json) {
    await printJsonEnvelope({ ok: true, kind: 'profiles_list', data: { authenticated: true, profiles } });
    return;
  }

  printProfilesHuman(profiles, true);
}

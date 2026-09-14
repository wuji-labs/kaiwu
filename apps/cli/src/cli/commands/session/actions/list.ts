import chalk from 'chalk';

import { listActionSpecs, serializeActionSpec } from '@happier-dev/protocol';

import { wantsJson, printJsonEnvelope } from '@/cli/output/jsonEnvelope';

export async function cmdSessionActionsList(argv: string[]): Promise<void> {
  const json = wantsJson(argv);
  const actionSpecs = listActionSpecs().map(serializeActionSpec);

  if (json) {
    await printJsonEnvelope({ ok: true, kind: 'session_actions_list', data: { actionSpecs } });
    return;
  }

  console.log(chalk.green('✓'), '已列出可用操作');
  for (const spec of listActionSpecs()) {
    console.log(`- ${spec.id}: ${spec.title}`);
  }
}

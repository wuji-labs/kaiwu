import chalk from 'chalk';

import { configuration } from '@/configuration';

export function showServerHelp(): void {
  console.log(`
${chalk.bold('kaiwu server')} - Manage relay profiles

${chalk.bold('Usage:')}
  kaiwu server list
  kaiwu server current
  kaiwu server add [--name <name>] [--server-url <url>] [--public-server-url <url>] [--webapp-url <url>] [--use] [--no-use] [--yes] [--start-daemon] [--install-service]
  kaiwu server use <name-or-id>
  kaiwu server remove <name-or-id> [--force]
  kaiwu server test [<name-or-id>]
  kaiwu server set [--server-id <id>] --server-url <url> [--public-server-url <url>] [--webapp-url <url>]

${chalk.bold('Notes:')}
  • Profiles are stored in ${configuration.settingsFile}
  • Credentials are stored per relay profile under ${configuration.serversDir}
  • Public relay URL is used for QR codes/deep links (defaults to relay URL)
  • add checks the relay answers /v1/version before saving it; --yes saves it without checking
  • Env vars override for one run: HAPPIER_SERVER_URL / HAPPIER_PUBLIC_SERVER_URL / HAPPIER_WEBAPP_URL
`);
}

import chalk from 'chalk';

import { listRootHelpCommands } from './commandSurfaceManifest';

const HELP_LABEL_WIDTH = 27;

function formatHelpEntry(label: string, description: string): string {
  return `  ${label.padEnd(HELP_LABEL_WIDTH)} ${description}`;
}

export function buildRootHelpText(): string {
  const helpEntries = listRootHelpCommands();
  return `
${chalk.bold('kaiwu')} - AI CLI On the Go

${chalk.bold('Usage:')}
${helpEntries.map((entry) => {
    const label = entry.rootHelpLabel ?? '';
    const description = entry.rootHelpDescription ?? '';
    const firstLine = formatHelpEntry(label, description);
    if (!entry.rootHelpDetail) return firstLine;
    return `${firstLine}\n${formatHelpEntry('', entry.rootHelpDetail)}`;
  }).join('\n')}

${chalk.bold('Examples:')}
  kaiwu                    Start session
  kaiwu --refresh-settings  Force-refresh account settings before starting
  kaiwu --launch-profile <id-or-name> Start with a launch profile from your settings
  kaiwu --auth cs:<id>    Start with an exact Connected Services profile or pool
  kaiwu --auth native     Start with native provider authentication
  kaiwu --yolo             Start with bypassing permissions
                              kaiwu sugar for --dangerously-skip-permissions
  kaiwu --chrome           Enable Chrome browser access for this session
  kaiwu --no-chrome        Disable Chrome even if default is on
  kaiwu --js-runtime bun   Use bun instead of node to spawn JavaScript-backed CLIs
  kaiwu auth login --force Authenticate
  kaiwu profiles list      List available backend profiles
  kaiwu doctor             Run diagnostics

${chalk.bold('Server selection (global flags; prefix-only; no persistence):')}
  kaiwu --server <name-or-id> ...
  kaiwu --server-url <url> [--webapp-url <url>] [--public-server-url <url>] ...
`;
}

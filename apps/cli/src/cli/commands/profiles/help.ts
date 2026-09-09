import chalk from 'chalk';

export function showProfilesHelp(): void {
  console.log(`
${chalk.bold('kaiwu profiles')} - Backend profiles

${chalk.bold('Usage:')}
  kaiwu profiles list [--refresh-settings] [--json]

${chalk.bold('Aliases:')}
  kaiwu profile list

${chalk.bold('Notes:')}
  - Use --profile <id-or-name> when starting a session to apply a profile.
  - Run "kaiwu auth login" to see custom profiles saved in your account settings.
`);
}


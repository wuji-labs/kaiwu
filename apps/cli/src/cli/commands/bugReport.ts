import chalk from 'chalk';
import type { CommandContext } from '@/cli/commandRegistry';
import {
  __internal,
  bugReportUsage,
  runBugReportCommand,
  type BugReportCommandDependencies,
  type BugReportCommandResult,
} from '@/diagnostics/bugReportCommandCore';

async function handleBugReportCommand(args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(bugReportUsage());
    return;
  }

  const result = await runBugReportCommand(args);
  if (result.mode === 'fallback') {
    const reasonLine = result.reason === 'submit-failed'
      ? '错误报告提交失败。您仍可使用以下备用地址手动提交问题：'
      : result.reason === 'feature-fetch-failed'
        ? '无法连接您的开物服务以检查错误报告配置。请使用以下备用地址手动提交问题：'
        : '此开物服务暂不可用错误报告功能。请打开以下备用问题地址：';
    console.log(chalk.yellow(reasonLine));
    if (result.errorMessage) {
      console.log(chalk.gray(`  底层错误：${result.errorMessage}`));
    }
    console.log(result.issueUrl);
    return;
  }

  console.log(chalk.green('✓ 错误报告已提交'));
  console.log(chalk.gray(`  问题：${result.issueUrl}`));
  console.log(chalk.gray(`  报告 ID：${result.reportId}`));
  console.log(chalk.gray(`  已包含诊断信息：${result.diagnosticsIncluded ? '是' : '否'}`));
  console.log(chalk.gray(`  已上传附件：${result.artifactCount}`));
}

export async function handleBugReportCliCommand(context: CommandContext): Promise<void> {
  try {
    await handleBugReportCommand(context.args.slice(1));
  } catch (error) {
    if (error instanceof Error && error.message === 'Help requested') {
      console.log(bugReportUsage());
      return;
    }
    console.error(chalk.red('错误：'), error instanceof Error ? error.message : '未知错误');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}
export { __internal, runBugReportCommand };
export type { BugReportCommandDependencies, BugReportCommandResult };

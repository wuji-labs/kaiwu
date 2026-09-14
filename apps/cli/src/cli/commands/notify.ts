import chalk from 'chalk';

import { ApiClient } from '@/api/api';
import { readCredentials } from '@/persistence';

import type { CommandContext } from '@/cli/commandRegistry';

export async function sendPushNotification({
  api,
  title,
  message,
  nowMs = Date.now(),
}: Readonly<{
  api: { push(): { sendToAllDevicesAsync(title: string, message: string, meta: { source: 'cli'; timestamp: number }): Promise<void> } };
  title: string;
  message: string;
  nowMs?: number;
}>): Promise<void> {
  await api.push().sendToAllDevicesAsync(title, message, {
    source: 'cli',
    timestamp: nowMs,
  });
}

export async function handleNotifyCliCommand(context: CommandContext): Promise<void> {
  try {
    await handleNotifyCommand(context.args.slice(1));
  } catch (error) {
    console.error(chalk.red('错误：'), error instanceof Error ? error.message : '未知错误');
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

async function handleNotifyCommand(args: string[]): Promise<void> {
  let message = '';
  let title = '';
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-p' && i + 1 < args.length) {
      message = args[++i];
    } else if (arg === '-t' && i + 1 < args.length) {
      title = args[++i];
    } else if (arg === '-h' || arg === '--help') {
      showHelp = true;
    } else {
      console.error(chalk.red(`notify 命令的未知参数：${arg}`));
      process.exit(1);
    }
  }

  if (showHelp) {
    console.log(`
${chalk.bold('kaiwu notify')} - 发送通知

${chalk.bold('用法:')}
  kaiwu notify -p <message> [-t <title>]    发送自定义消息，可选标题
  kaiwu notify -h, --help                   显示此帮助

${chalk.bold('选项:')}
  -p <message>    通知消息（必填）
  -t <title>      通知标题（可选，默认为“Kaiwu”）

${chalk.bold('示例:')}
  kaiwu notify -p "Deployment complete!"
  kaiwu notify -p "System update complete" -t "Server Status"
  kaiwu notify -t "Alert" -p "Database connection restored"
`);
    return;
  }

  if (!message) {
    console.error(
      chalk.red('错误：必须提供消息。请使用 -p "你的消息" 指定通知内容。'),
    );
    console.log(chalk.gray('运行 “kaiwu notify --help” 查看用法。'));
    process.exit(1);
  }

  const credentials = await readCredentials();
  if (!credentials) {
    console.error(chalk.red('错误：尚未登录。请先运行 “kaiwu auth login”。'));
    process.exit(1);
  }

  console.log(chalk.blue('📱 正在发送推送通知……'));

  try {
    const api = await ApiClient.create(credentials);

    const notificationTitle = title || 'Kaiwu';

    await sendPushNotification({ api, title: notificationTitle, message });

    console.log(chalk.green('✓ 推送通知已成功发送！'));
    console.log(chalk.gray(`  标题：${notificationTitle}`));
    console.log(chalk.gray(`  消息：${message}`));
    console.log(chalk.gray('  请在手机上查看通知。'));
  } catch (error) {
    console.error(chalk.red('✗ 推送通知发送失败'));
    throw error;
  }
}

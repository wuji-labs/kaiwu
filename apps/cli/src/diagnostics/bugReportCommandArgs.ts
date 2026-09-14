import chalk from 'chalk';
import type {
  BugReportDeploymentType,
  BugReportFrequency,
  BugReportSeverity,
} from '@happier-dev/protocol';
import {
  BUG_REPORT_DEFAULT_ISSUE_OWNER,
  BUG_REPORT_DEFAULT_ISSUE_REPO,
} from '@happier-dev/protocol';

export type BugReportAttachmentArg = {
  path: string;
  sourceKind: 'attachment' | 'session-log' | 'provider-transcript';
};

export type ParsedBugReportArgs = {
  showHelp: boolean;
  title: string;
  githubUsername: string;
  summary: string;
  currentBehavior: string;
  expectedBehavior: string;
  reproductionSteps: string[];
  frequency: BugReportFrequency;
  severity: BugReportSeverity;
  whatChangedRecently: string;
  includeDiagnostics: boolean | null;
  acceptedPrivacyNotice: boolean;
  providerUrl: string;
  existingIssueNumber: number | null;
  skipSimilarIssues: boolean;
  serverVersion: string;
  deploymentType: BugReportDeploymentType | null;
  sessionId: string;
  attachments: BugReportAttachmentArg[];
};

export function bugReportUsage(): string {
  return [
    `${chalk.bold('kaiwu bug-report')} - 提交包含可选诊断信息的结构化错误报告`,
    '',
    `${chalk.bold('用法:')}`,
    '  kaiwu bug-report --title <title> --summary <text> [options]',
    '',
    `${chalk.bold('必填字段:')}`,
    '  --title <text>',
    '  --summary <text>',
    '',
    `${chalk.bold('选项:')}`,
    '  --current-behavior <text>         可选补充信息',
    '  --expected-behavior <text>        可选补充信息',
    '  --repro-step <text>               添加一个复现步骤（可重复）',
    '  --frequency <always|often|sometimes|once>   默认：often',
    '  --severity <blocker|high|medium|low>        默认：medium',
    '  --github-username <username>      可选的报告人联系方式',
    '  --what-changed-recently <text>',
    '  --include-diagnostics / --no-include-diagnostics',
    '  --accept-privacy-notice            跳过交互式隐私确认',
    '  --provider-url <url>               覆盖诊断服务地址',
    '  --existing-issue-number <number>   将报告作为评论发布到已有问题',
    '  --no-similar-issues                跳过相似问题搜索',
    '  --server-version <version>',
    '  --deployment-type <cloud|self-hosted|enterprise>',
    '  --session-id <id>                  绑定到指定的开物会话 ID',
    '  --attach <path>                    附加文件（可重复）',
    '  --attach-session-log <path>        附加开物会话日志文件（可重复）',
    '  --attach-provider-transcript <path> 附加供应商会话记录（Claude/Codex/...）（可重复）',
    '  -h, --help',
  ].join('\n');
}

export function parseBugReportArgs(args: string[]): ParsedBugReportArgs {
  const parsed: ParsedBugReportArgs = {
    showHelp: false,
    title: '',
    githubUsername: '',
    summary: '',
    currentBehavior: '',
    expectedBehavior: '',
    reproductionSteps: [],
    frequency: 'often',
    severity: 'medium',
    whatChangedRecently: '',
    includeDiagnostics: null,
    acceptedPrivacyNotice: false,
    providerUrl: '',
    existingIssueNumber: null,
    skipSimilarIssues: false,
    serverVersion: '',
    deploymentType: null,
    sessionId: '',
    attachments: [],
  };

  const readValue = (
    index: number,
    flag: string,
    options?: { allowLeadingDash?: boolean },
  ): [string, number] => {
    const value = String(args[index + 1] ?? '');
    if (!value) {
      throw new Error(`缺少 ${flag} 的值`);
    }

    // Don't accidentally consume the next flag as a value.
    if (value === '-h' || value === '--help' || value.startsWith('--')) {
      throw new Error(`缺少 ${flag} 的值`);
    }

    const allowLeadingDash = Boolean(options?.allowLeadingDash);
    if (!allowLeadingDash && value.startsWith('-')) {
      throw new Error(`缺少 ${flag} 的值`);
    }

    return [value, index + 1];
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-h' || arg === '--help') {
      parsed.showHelp = true;
      continue;
    }
    if (arg === '--title') {
      [parsed.title, index] = readValue(index, arg, { allowLeadingDash: true });
      continue;
    }
    if (arg === '--summary') {
      [parsed.summary, index] = readValue(index, arg, { allowLeadingDash: true });
      continue;
    }
    if (arg === '--github-username') {
      [parsed.githubUsername, index] = readValue(index, arg);
      continue;
    }
    if (arg === '--current-behavior') {
      [parsed.currentBehavior, index] = readValue(index, arg, { allowLeadingDash: true });
      continue;
    }
    if (arg === '--expected-behavior') {
      [parsed.expectedBehavior, index] = readValue(index, arg, { allowLeadingDash: true });
      continue;
    }
    if (arg === '--repro-step') {
      let value = '';
      [value, index] = readValue(index, arg, { allowLeadingDash: true });
      parsed.reproductionSteps.push(value);
      continue;
    }
    if (arg === '--frequency') {
      let value = '';
      [value, index] = readValue(index, arg);
      if (value !== 'always' && value !== 'often' && value !== 'sometimes' && value !== 'once') {
        throw new Error(`无效的 --frequency 值：${value}`);
      }
      parsed.frequency = value;
      continue;
    }
    if (arg === '--severity') {
      let value = '';
      [value, index] = readValue(index, arg);
      if (value !== 'blocker' && value !== 'high' && value !== 'medium' && value !== 'low') {
        throw new Error(`无效的 --severity 值：${value}`);
      }
      parsed.severity = value;
      continue;
    }
    if (arg === '--what-changed-recently') {
      [parsed.whatChangedRecently, index] = readValue(index, arg, { allowLeadingDash: true });
      continue;
    }
    if (arg === '--include-diagnostics') {
      parsed.includeDiagnostics = true;
      continue;
    }
    if (arg === '--no-include-diagnostics') {
      parsed.includeDiagnostics = false;
      continue;
    }
    if (arg === '--accept-privacy-notice') {
      parsed.acceptedPrivacyNotice = true;
      continue;
    }
    if (arg === '--provider-url') {
      [parsed.providerUrl, index] = readValue(index, arg);
      continue;
    }
    if (arg === '--existing-issue-number') {
      let value = '';
      [value, index] = readValue(index, arg);
      const parsedNumber = Number(value);
      if (!Number.isFinite(parsedNumber) || !Number.isInteger(parsedNumber) || parsedNumber <= 0) {
        throw new Error(`无效的 --existing-issue-number 值：${value}`);
      }
      parsed.existingIssueNumber = parsedNumber;
      continue;
    }
    if (arg === '--no-similar-issues') {
      parsed.skipSimilarIssues = true;
      continue;
    }
    if (arg === '--server-version') {
      [parsed.serverVersion, index] = readValue(index, arg);
      continue;
    }
    if (arg === '--deployment-type') {
      let deployment = '';
      [deployment, index] = readValue(index, arg);
      if (deployment !== 'cloud' && deployment !== 'self-hosted' && deployment !== 'enterprise') {
        throw new Error(`无效的 --deployment-type 值：${deployment}`);
      }
      parsed.deploymentType = deployment;
      continue;
    }
    if (arg === '--session-id') {
      [parsed.sessionId, index] = readValue(index, arg);
      continue;
    }
    if (arg === '--attach') {
      let value = '';
      [value, index] = readValue(index, arg);
      parsed.attachments.push({ path: value, sourceKind: 'attachment' });
      continue;
    }
    if (arg === '--attach-session-log') {
      let value = '';
      [value, index] = readValue(index, arg);
      parsed.attachments.push({ path: value, sourceKind: 'session-log' });
      continue;
    }
    if (arg === '--attach-provider-transcript') {
      let value = '';
      [value, index] = readValue(index, arg);
      parsed.attachments.push({ path: value, sourceKind: 'provider-transcript' });
      continue;
    }

    throw new Error(`bug-report 命令的未知参数：${arg}`);
  }

  parsed.title = parsed.title.trim();
  parsed.githubUsername = parsed.githubUsername.trim();
  parsed.summary = parsed.summary.trim();
  parsed.currentBehavior = parsed.currentBehavior.trim();
  parsed.expectedBehavior = parsed.expectedBehavior.trim();
  parsed.whatChangedRecently = parsed.whatChangedRecently.trim();
  parsed.providerUrl = parsed.providerUrl.trim();
  parsed.serverVersion = parsed.serverVersion.trim();
  parsed.sessionId = parsed.sessionId.trim();
  parsed.attachments = parsed.attachments
    .map((entry) => ({ path: entry.path.trim(), sourceKind: entry.sourceKind }))
    .filter((entry) => entry.path.length > 0);
  return parsed;
}

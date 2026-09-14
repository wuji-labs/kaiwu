import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

import { MessageBuffer, type BufferedMessage } from '@/ui/ink/messageBuffer';
import {
  createRemoteModeControlController,
  interpretRemoteModeKeypress,
  type RemoteModeActionInProgress,
  type RemoteModeConfirmation,
  type RemoteModeControlController,
  type RemoteModeKeypressAction,
} from '@/ui/remoteControl/remoteModeControl';

export { interpretRemoteModeKeypress };
export type { RemoteModeActionInProgress, RemoteModeConfirmation, RemoteModeKeypressAction };

export const REMOTE_CONTROL_WAITING = '等待消息中...';
export const REMOTE_CONTROL_EXITING = '正在退出...';
export const REMOTE_CONTROL_SWITCHING = '正在切换至本地模式...';
export const REMOTE_CONTROL_CONFIRM_EXIT = '⚠️ 再次按 Ctrl-C 完全退出';
export const REMOTE_CONTROL_CONFIRM_SWITCH = '⏸️ 再次按空格键（或 Ctrl-T）切换至本地模式';
export const REMOTE_CONTROL_PROMPT_SWITCH = '📱 按空格键（或 Ctrl-T）切换至本地模式 • 按 Ctrl-C 退出';

export function formatRemoteControlHeader(providerName: string): string {
  return `📡 远程模式 - ${providerName} 消息`;
}

export function formatRemoteControlExitOnlyPrompt(providerName: string): string {
  return `${providerName} 远程模式 • 按 Ctrl-C 退出`;
}

export function formatRemoteControlDebugLogs(logPath: string): string {
  return `调试日志: ${logPath}`;
}

export type RemoteControlDisplayProps = {
  providerName: string;
  messageBuffer: MessageBuffer;
  logPath?: string;
  allowSwitchToLocal?: boolean;
  onExit?: () => void | Promise<void>;
  onSwitchToLocal?: () => void | Promise<void>;
};

export const RemoteControlDisplay: React.FC<RemoteControlDisplayProps> = ({
  providerName,
  messageBuffer,
  logPath,
  allowSwitchToLocal,
  onExit,
  onSwitchToLocal,
}) => {
  const [messages, setMessages] = useState<BufferedMessage[]>([]);
  const [confirmationMode, setConfirmationMode] = useState<RemoteModeConfirmation>(null);
  const [actionInProgress, setActionInProgress] = useState<RemoteModeActionInProgress>(null);
  const controllerRef = useRef<RemoteModeControlController | null>(null);
  const { stdout } = useStdout();
  const terminalWidth = stdout.columns || 80;
  const terminalHeight = stdout.rows || 24;

  const switchEnabled = allowSwitchToLocal === true && typeof onSwitchToLocal === 'function';

  useEffect(() => {
    setMessages(messageBuffer.getMessages());

    const unsubscribe = messageBuffer.onUpdate((newMessages) => {
      setMessages(newMessages);
    });

    return () => {
      unsubscribe();
    };
  }, [messageBuffer]);

  useEffect(() => {
    const controller = createRemoteModeControlController({
      allowSwitchToLocal: switchEnabled,
      onExit,
      onSwitchToLocal,
      onStateChange: (snapshot) => {
        setConfirmationMode(snapshot.confirmationMode);
        setActionInProgress(snapshot.actionInProgress);
      },
    });
    controllerRef.current = controller;
    const snapshot = controller.getSnapshot();
    setConfirmationMode(snapshot.confirmationMode);
    setActionInProgress(snapshot.actionInProgress);

    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [switchEnabled, onExit, onSwitchToLocal]);

  useInput(
    useCallback(
      (input, key) => {
        controllerRef.current?.handleKeypress(input, key);
      },
      [],
    ),
  );

  const getMessageColor = (type: BufferedMessage['type']): string => {
    switch (type) {
      case 'user':
        return 'magenta';
      case 'assistant':
        return 'cyan';
      case 'system':
        return 'blue';
      case 'tool':
        return 'yellow';
      case 'result':
        return 'green';
      case 'status':
        return 'gray';
      default:
        return 'white';
    }
  };

  const formatMessage = (msg: BufferedMessage): string => {
    const lines = msg.content.split('\n');
    const maxLineLength = terminalWidth - 10;
    return lines
      .map((line) => {
        if (line.length <= maxLineLength) return line;
        const chunks: string[] = [];
        for (let i = 0; i < line.length; i += maxLineLength) {
          chunks.push(line.slice(i, i + maxLineLength));
        }
        return chunks.join('\n');
      })
      .join('\n');
  };

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      <Box
        flexDirection="column"
        width={terminalWidth}
        height={terminalHeight - 4}
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        overflow="hidden"
      >
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray" bold>
            {formatRemoteControlHeader(providerName)}
          </Text>
          <Text color="gray" dimColor>
            {'─'.repeat(Math.min(terminalWidth - 4, 60))}
          </Text>
        </Box>

        <Box flexDirection="column" height={terminalHeight - 10} overflow="hidden">
          {messages.length === 0 ? (
            <Text color="gray" dimColor>
              {REMOTE_CONTROL_WAITING}
            </Text>
          ) : (
            messages.slice(-Math.max(1, terminalHeight - 10)).map((msg) => (
              <Box key={msg.id} flexDirection="column" marginBottom={1}>
                <Text color={getMessageColor(msg.type)} dimColor>
                  {formatMessage(msg)}
                </Text>
              </Box>
            ))
          )}
        </Box>
      </Box>

      <Box
        width={terminalWidth}
        borderStyle="round"
        borderColor={
          actionInProgress ? 'gray' : confirmationMode === 'exit' ? 'red' : confirmationMode === 'switch' ? 'yellow' : 'green'
        }
        paddingX={2}
        justifyContent="center"
        alignItems="center"
        flexDirection="column"
      >
        <Box flexDirection="column" alignItems="center">
          {actionInProgress === 'exiting' ? (
            <Text color="gray" bold>
              {REMOTE_CONTROL_EXITING}
            </Text>
          ) : actionInProgress === 'switching' ? (
            <Text color="gray" bold>
              {REMOTE_CONTROL_SWITCHING}
            </Text>
          ) : confirmationMode === 'exit' ? (
            <Text color="red" bold>
              {REMOTE_CONTROL_CONFIRM_EXIT}
            </Text>
          ) : confirmationMode === 'switch' ? (
            <Text color="yellow" bold>
              {REMOTE_CONTROL_CONFIRM_SWITCH}
            </Text>
          ) : switchEnabled ? (
            <Text color="green" bold>
              {REMOTE_CONTROL_PROMPT_SWITCH}
            </Text>
          ) : (
            <Text color="green" bold>
              {formatRemoteControlExitOnlyPrompt(providerName)}
            </Text>
          )}
          {process.env.DEBUG && logPath && (
            <Text color="gray" dimColor>
              {formatRemoteControlDebugLogs(logPath)}
            </Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};

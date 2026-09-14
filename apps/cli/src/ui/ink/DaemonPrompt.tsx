import React, { useState } from 'react';
import { Text, useInput, Box } from 'ink';

export const DAEMON_PROMPT_TITLE = '🚀 Kaiwu 守护进程设置';
export const DAEMON_PROMPT_INTRO = '📱 Kaiwu 可以运行后台服务，以便你：';
export const DAEMON_PROMPT_BENEFITS: readonly string[] = [
    '• 从手机发起新对话',
    '• 远程继续已关闭的对话',
    '• 只要电脑保持联网即可与 Claude 协同工作',
];
export const DAEMON_PROMPT_QUESTION = '是否希望 Kaiwu 自动启动此服务？';
export const DAEMON_PROMPT_OPTIONS: ReadonlyArray<{
    value: boolean;
    label: string;
    key: string;
}> = [
    { value: true, label: '是（推荐）', key: 'Y' },
    { value: false, label: '否', key: 'N' },
];
export const DAEMON_PROMPT_FOOTER = '按 Y/N 或使用方向键 + Enter 选择';

interface DaemonPromptProps {
    onSelect: (autoStart: boolean) => void;
}

export const DaemonPrompt: React.FC<DaemonPromptProps> = ({ onSelect }) => {
    const [selectedIndex, setSelectedIndex] = useState(0); // 0 = Yes, 1 = No

    const options = DAEMON_PROMPT_OPTIONS;

    useInput((input, key) => {
        const upperInput = input.toUpperCase();

        if (key.upArrow || key.leftArrow) {
            setSelectedIndex(0);
        } else if (key.downArrow || key.rightArrow) {
            setSelectedIndex(1);
        } else if (key.return) {
            onSelect(options[selectedIndex].value);
        } else if (upperInput === 'Y') {
            onSelect(true);
        } else if (upperInput === 'N') {
            onSelect(false);
        } else if (key.escape || (key.ctrl && input === 'c')) {
            // Default to not auto-starting if cancelled
            onSelect(false);
        }
    });

    return (
        <Box flexDirection="column">
            <Box marginBottom={1}>
                <Text bold color="cyan">{DAEMON_PROMPT_TITLE}</Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
                <Text>{DAEMON_PROMPT_INTRO}</Text>
                {DAEMON_PROMPT_BENEFITS.map((benefit) => (
                    <Text key={benefit} color="cyan">  {benefit}</Text>
                ))}
            </Box>

            <Box marginBottom={1}>
                <Text>{DAEMON_PROMPT_QUESTION}</Text>
            </Box>

            <Box flexDirection="column">
                {options.map((option, index) => {
                    const isSelected = selectedIndex === index;

                    return (
                        <Box key={option.key}>
                            <Text color={isSelected ? "green" : "gray"}>
                                {isSelected ? '› ' : '  '}
                                [{option.key}] {option.label}
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            <Box marginTop={1}>
                <Text dimColor>{DAEMON_PROMPT_FOOTER}</Text>
            </Box>
        </Box>
    );
};

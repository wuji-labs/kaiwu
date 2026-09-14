import React, { useState, useEffect } from 'react';
import { Text, useInput, Box } from 'ink';

export type AuthMethod = 'mobile' | 'web';

export const AUTH_SELECTOR_OPTIONS: ReadonlyArray<{
    method: AuthMethod;
    label: string;
}> = [
    {
        method: 'mobile',
        label: '手机 App（推荐）'
    },
    {
        method: 'web',
        label: '网页浏览器'
    }
];

export const AUTH_SELECTOR_TITLE = '请选择身份认证方式：';
export const AUTH_SELECTOR_MOBILE_HINT = '推荐使用手机 App，账号注册与设备绑定更加简单。';
export const AUTH_SELECTOR_ACCOUNT_HINT = '如果你已在其他设备上使用 Kaiwu，请登录同一账号。';
export const AUTH_SELECTOR_FOOTER = '使用方向键或 1-2 选择，按 Enter 确认';

interface AuthSelectorProps {
    onSelect: (method: AuthMethod) => void;
    onCancel: () => void;
}

export const AuthSelector: React.FC<AuthSelectorProps> = ({ onSelect, onCancel }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const options = AUTH_SELECTOR_OPTIONS;

    useInput((input, key) => {
        if (key.upArrow) {
            setSelectedIndex(prev => Math.max(0, prev - 1));
        } else if (key.downArrow) {
            setSelectedIndex(prev => Math.min(options.length - 1, prev + 1));
        } else if (key.return) {
            onSelect(options[selectedIndex].method);
        } else if (key.escape || (key.ctrl && input === 'c')) {
            onCancel();
        } else if (input === '1') {
            setSelectedIndex(0);
            onSelect('mobile');
        } else if (input === '2') {
            setSelectedIndex(1);
            onSelect('web');
        }
    });

    return (
        <Box flexDirection="column" paddingY={1}>
            <Box marginBottom={1}>
                <Text>{AUTH_SELECTOR_TITLE}</Text>
            </Box>
            <Box marginBottom={1}>
                <Text dimColor>{AUTH_SELECTOR_MOBILE_HINT}</Text>
            </Box>
            <Box marginBottom={1}>
                <Text dimColor>{AUTH_SELECTOR_ACCOUNT_HINT}</Text>
            </Box>

            <Box flexDirection="column">
                {options.map((option, index) => {
                    const isSelected = selectedIndex === index;

                    return (
                        <Box key={option.method} marginY={0}>
                            <Text color={isSelected ? "cyan" : "gray"}>
                                {isSelected ? '› ' : '  '}
                                {index + 1}. {option.label}
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            <Box marginTop={1}>
                <Text dimColor>{AUTH_SELECTOR_FOOTER}</Text>
            </Box>
        </Box>
    );
};

import * as React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Text } from '@/components/ui/text/Text';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

/** Shared controls for the legacy patch and Happy Agent contents viewers. */
export const DiffHeaderRight = React.memo(function DiffHeaderRight({
    fileCount,
    diffStyle,
    onDiffStyleChange,
    ignoreWhitespace,
    onIgnoreWhitespaceChange,
    onRefresh,
    refreshing = false,
}: {
    fileCount: number | null;
    diffStyle: 'unified' | 'split';
    onDiffStyleChange: (value: 'unified' | 'split') => void;
    ignoreWhitespace: boolean;
    onIgnoreWhitespaceChange: (value: boolean) => void;
    onRefresh?: () => void;
    refreshing?: boolean;
}) {
    const { theme } = useUnistyles();
    return (
        <>
            {onRefresh ? (
                <Pressable
                    onPress={onRefresh}
                    disabled={refreshing}
                    hitSlop={8}
                    accessibilityLabel={t('common.refresh')}
                    style={{ opacity: refreshing ? 0.4 : 1 }}
                >
                    <Ionicons name="refresh" size={18} color={theme.colors.text.secondary} />
                </Pressable>
            ) : null}
            <Pressable
                onPress={() => onIgnoreWhitespaceChange(!ignoreWhitespace)}
                hitSlop={8}
                accessibilityLabel={t('files.diff')}
                style={({ pressed }) => [
                    styles.whitespaceToggle,
                    {
                        backgroundColor: ignoreWhitespace ? theme.colors.surface.elevated : 'transparent',
                        borderColor: theme.colors.border.default,
                        opacity: pressed ? 0.6 : 1,
                    },
                ]}
            >
                <Text style={[
                    styles.whitespaceToggleText,
                    { color: ignoreWhitespace ? theme.colors.text.primary : theme.colors.text.secondary },
                ]}>
                    {'\u00B7\u2192'}
                </Text>
            </Pressable>
            {fileCount !== null ? (
                <Text style={[styles.headerRightCount, { color: theme.colors.text.secondary }]}>
                    {t('files.sourceControlStatus.changedFilesLabel', { count: fileCount })}
                </Text>
            ) : null}
            {Platform.OS === 'web' ? <DiffStyleToggle value={diffStyle} onChange={onDiffStyleChange} /> : null}
        </>
    );
});

const DiffStyleToggle = React.memo(function DiffStyleToggle({ value, onChange }: {
    value: 'unified' | 'split';
    onChange: (value: 'unified' | 'split') => void;
}) {
    const { theme } = useUnistyles();
    return (
        <View style={[styles.toggle, { backgroundColor: theme.colors.surface.sectionTint, borderColor: theme.colors.border.default }]}>
            {(['unified', 'split'] as const).map((style) => (
                <Pressable
                    key={style}
                    onPress={() => onChange(style)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: value === style ? theme.colors.surface.base : 'transparent' }}
                >
                    <Text style={{ fontSize: 12, ...Typography.default(value === style ? 'semiBold' : undefined), color: value === style ? theme.colors.text.primary : theme.colors.text.secondary }}>
                        {style === 'unified' ? 'Unified' : 'Split'}
                    </Text>
                </Pressable>
            ))}
        </View>
    );
});

const styles = StyleSheet.create({
    headerRightCount: { fontSize: 13, ...Typography.default() },
    whitespaceToggle: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
    whitespaceToggleText: { fontSize: 13, ...Typography.mono() },
    toggle: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth },
});

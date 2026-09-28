import * as React from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useRouter } from 'expo-router';

import type { ToolViewProps } from '../core/_registry';
import { ToolSectionView } from '../../shell/presentation/ToolSectionView';
import { Text } from '@/components/ui/text/Text';
import { Icon, type IconName } from '@/components/ui/icons/Icon';
import { ActivitySpinner } from '@/components/ui/feedback/ActivitySpinner';
import { pushSessionFileDeepLink } from '@/utils/url/sessionFileDeepLink';
import { useWorkspaceFileTransfers } from '@/hooks/session/files/useWorkspaceFileTransfers';
import { t } from '@/text';

function formatBytes(bytes: number): string {
    const value = Number.isFinite(bytes) ? bytes : 0;
    if (value < 1024) return `${Math.max(0, Math.floor(value))} B`;
    const kb = value / 1024;
    if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

function resolveFileIconName(mimeType?: string, fileName?: string): IconName {
    const lowerMime = (mimeType ?? '').toLowerCase();
    const lowerName = (fileName ?? '').toLowerCase();

    if (lowerMime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(lowerName)) {
        return 'image';
    }
    if (lowerMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
        return 'file-text';
    }
    if (
        lowerMime.includes('code') ||
        lowerMime.includes('javascript') ||
        lowerMime.includes('typescript') ||
        lowerMime.includes('json') ||
        /\.(ts|tsx|js|jsx|json|py|rs|go|c|cpp|h|java|html|css|scss|md|markdown|sh|zsh)$/i.test(lowerName)
    ) {
        return 'file-code';
    }
    if (lowerMime.startsWith('text/')) {
        return 'file-text';
    }
    return 'file';
}

export const SendFileView = React.memo<ToolViewProps>(({ tool, detailLevel, sessionId }) => {
    if (detailLevel === 'title') return null;

    const { theme } = useUnistyles();
    const router = useRouter();

    const result = tool.result && typeof tool.result === 'object' && !Array.isArray(tool.result)
        ? (tool.result as Record<string, unknown>)
        : null;
    const input = tool.input && typeof tool.input === 'object' && !Array.isArray(tool.input)
        ? (tool.input as Record<string, unknown>)
        : null;

    const rawPath = typeof result?.path === 'string' && result.path.trim().length > 0
        ? result.path.trim()
        : typeof input?.path === 'string' && input.path.trim().length > 0
        ? input.path.trim()
        : '';

    const fileName = typeof result?.fileName === 'string' && result.fileName.trim().length > 0
        ? result.fileName.trim()
        : rawPath
        ? rawPath.split(/[/\\]/).pop() || rawPath
        : '';

    const sizeBytes = typeof result?.sizeBytes === 'number' && Number.isFinite(result.sizeBytes)
        ? result.sizeBytes
        : undefined;

    const mimeType = typeof result?.mimeType === 'string' && result.mimeType.trim().length > 0
        ? result.mimeType.trim()
        : undefined;

    const message = typeof result?.message === 'string' && result.message.trim().length > 0
        ? result.message.trim()
        : typeof input?.message === 'string' && input.message.trim().length > 0
        ? input.message.trim()
        : undefined;

    const activeSessionId = sessionId ?? '';
    const transfers = useWorkspaceFileTransfers({
        sessionId: activeSessionId,
    });

    const isDownloading = transfers.downloadState.status === 'downloading';
    const [downloadError, setDownloadError] = React.useState<string | null>(null);

    const handlePreview = React.useCallback(() => {
        if (!activeSessionId || !rawPath) return;
        pushSessionFileDeepLink(router, {
            sessionId: activeSessionId,
            filePath: rawPath,
        });
    }, [router, activeSessionId, rawPath]);

    const handleDownload = React.useCallback(async () => {
        if (!activeSessionId || !rawPath || isDownloading) return;
        setDownloadError(null);
        try {
            const res = await transfers.startDownload({ path: rawPath, asZip: false });
            if (!res.ok) {
                setDownloadError(res.error || t('tools.sendFileView.failedToDownload'));
            }
        } catch (error: any) {
            setDownloadError(error?.message || t('tools.sendFileView.failedToDownload'));
        }
    }, [activeSessionId, rawPath, isDownloading, transfers]);

    const iconName = resolveFileIconName(mimeType, fileName);

    return (
        <ToolSectionView>
            <View testID="send-file-view" style={styles.card}>
                <View style={styles.mainRow}>
                    <View testID="send-file-icon" style={styles.iconContainer}>
                        <Icon name={iconName} size={24} color={theme.colors.text.primary} />
                    </View>
                    <View style={styles.contentCol}>
                        <Text testID="send-file-name" style={styles.fileName} numberOfLines={1}>
                            {fileName || t('tools.names.sendFileToUser')}
                        </Text>
                        <View style={styles.metaRow}>
                            {sizeBytes !== undefined ? (
                                <Text testID="send-file-size" style={styles.fileSize}>
                                    {formatBytes(sizeBytes)}
                                </Text>
                            ) : null}
                            {mimeType ? (
                                <Text testID="send-file-mimetype" style={styles.fileMime}>
                                    {mimeType}
                                </Text>
                            ) : null}
                        </View>
                    </View>
                </View>

                {message ? (
                    <View testID="send-file-message" style={styles.messageBox}>
                        <Text style={styles.messageText}>{message}</Text>
                    </View>
                ) : null}

                {downloadError ? (
                    <Text testID="send-file-error" style={styles.errorText}>
                        {downloadError}
                    </Text>
                ) : null}

                <View style={styles.actionRow}>
                    <Pressable
                        testID="send-file-preview-button"
                        accessibilityRole="button"
                        accessibilityLabel={t('tools.sendFileView.preview')}
                        disabled={!activeSessionId || !rawPath}
                        onPress={handlePreview}
                        style={({ pressed }) => [
                            styles.actionButton,
                            styles.previewButton,
                            (!activeSessionId || !rawPath) && styles.disabledButton,
                            pressed && styles.pressedButton,
                        ]}
                    >
                        <Icon name="eye" size={14} color={theme.colors.text.primary} />
                        <Text style={styles.actionButtonText}>
                            {t('tools.sendFileView.preview')}
                        </Text>
                    </Pressable>

                    <Pressable
                        testID="send-file-download-button"
                        accessibilityRole="button"
                        accessibilityLabel={t('tools.sendFileView.download')}
                        disabled={isDownloading || !activeSessionId || !rawPath}
                        onPress={handleDownload}
                        style={({ pressed }) => [
                            styles.actionButton,
                            styles.downloadButton,
                            (isDownloading || !activeSessionId || !rawPath) && styles.disabledButton,
                            pressed && styles.pressedButton,
                        ]}
                    >
                        {isDownloading ? (
                            <ActivitySpinner size="small" color={theme.colors.button.primary.tint} />
                        ) : (
                            <Icon name="download" size={14} color={theme.colors.button.primary.tint} />
                        )}
                        <Text style={styles.downloadButtonText}>
                            {isDownloading
                                ? t('tools.sendFileView.downloading')
                                : t('tools.sendFileView.download')}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </ToolSectionView>
    );
});

const styles = StyleSheet.create((theme) => ({
    card: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
        backgroundColor: theme.colors.surface.elevated,
        gap: 10,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: theme.colors.surface.inset,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    contentCol: {
        flex: 1,
        minWidth: 0,
        gap: 2,
    },
    fileName: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text.primary,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    fileSize: {
        fontSize: 12,
        color: theme.colors.text.secondary,
    },
    fileMime: {
        fontSize: 11,
        color: theme.colors.text.tertiary,
    },
    messageBox: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: theme.colors.surface.inset,
    },
    messageText: {
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.text.primary,
    },
    errorText: {
        fontSize: 12,
        color: theme.colors.text.destructive,
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 2,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
    },
    previewButton: {
        borderColor: theme.colors.border.default,
        backgroundColor: theme.colors.surface.base,
    },
    downloadButton: {
        borderColor: theme.colors.button.primary.background,
        backgroundColor: theme.colors.button.primary.background,
    },
    actionButtonText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.text.primary,
    },
    downloadButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.button.primary.tint,
    },
    disabledButton: {
        opacity: 0.5,
    },
    pressedButton: {
        opacity: 0.75,
    },
}));

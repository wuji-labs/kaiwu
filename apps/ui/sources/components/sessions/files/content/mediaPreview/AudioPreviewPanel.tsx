import * as React from 'react';
import { Platform, View, Text, Pressable, StyleSheet } from 'react-native';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

export type AudioPreviewPanelProps = Readonly<{
    uri: string;
    theme: any;
    fileName: string;
}>;

function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const totalSecs = Math.floor(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPreviewPanel(props: AudioPreviewPanelProps) {
    const { uri, theme, fileName } = props;

    if (Platform.OS === 'web') {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.surface.base }]}>
                <View style={[styles.card, { backgroundColor: theme.colors.surface.elevated, borderColor: theme.colors.border.default }]}>
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>{fileName}</Text>
                    <View style={styles.webAudioWrapper}>
                        <audio
                            controls
                            src={uri}
                            style={{
                                width: '100%',
                                outline: 'none',
                                filter: theme.dark ? 'invert(0.9) hue-rotate(180deg)' : 'none',
                            }}
                        />
                    </View>
                </View>
            </View>
        );
    }

    return <NativeAudioPlayer uri={uri} theme={theme} fileName={fileName} />;
}

function NativeAudioPlayer(props: AudioPreviewPanelProps) {
    const { uri, theme, fileName } = props;
    const [isPlaying, setIsPlaying] = React.useState(false);
    const [currentTime, setCurrentTime] = React.useState(0);
    const [duration, setDuration] = React.useState(0);
    const playerRef = React.useRef<any>(null);

    React.useEffect(() => {
        let isMounted = true;
        let playerInstance: any = null;
        let timer: any = null;

        void (async () => {
            try {
                const { createAudioPlayer } = await import('expo-audio');
                if (!isMounted) return;
                playerInstance = createAudioPlayer(uri);
                playerRef.current = playerInstance;

                // Status polling
                timer = setInterval(() => {
                    if (!playerInstance) return;
                    setIsPlaying(playerInstance.playing === true);
                    setCurrentTime(playerInstance.currentTime ?? 0);
                    if (playerInstance.duration && playerInstance.duration > 0) {
                        setDuration(playerInstance.duration);
                    }
                }, 250);
            } catch (err) {
                console.warn('NativeAudioPlayer init error:', err);
            }
        })();

        return () => {
            isMounted = false;
            if (timer) clearInterval(timer);
            if (playerInstance) {
                try {
                    playerInstance.pause();
                    playerInstance.remove();
                } catch {
                    // best effort
                }
            }
            playerRef.current = null;
        };
    }, [uri]);

    const togglePlay = React.useCallback(() => {
        const player = playerRef.current;
        if (!player) return;
        if (isPlaying) {
            player.pause();
            setIsPlaying(false);
        } else {
            player.play();
            setIsPlaying(true);
        }
    }, [isPlaying]);

    const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface.base }]}>
            <View style={[styles.card, { backgroundColor: theme.colors.surface.elevated, borderColor: theme.colors.border.default }]}>
                <Text style={[styles.title, { color: theme.colors.text.primary }]}>{fileName}</Text>

                {/* Progress Bar Container */}
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBarBackground, { backgroundColor: theme.colors.border.default }]}>
                        <View style={[styles.progressBarFill, { width: `${progressRatio * 100}%`, backgroundColor: theme.colors.accent?.primary ?? theme.colors.text.primary }]} />
                    </View>
                    <View style={styles.timeRow}>
                        <Text style={[styles.timeText, { color: theme.colors.text.secondary }]}>{formatDuration(currentTime)}</Text>
                        <Text style={[styles.timeText, { color: theme.colors.text.secondary }]}>{formatDuration(duration)}</Text>
                    </View>
                </View>

                {/* Play / Pause button */}
                <View style={styles.controlsRow}>
                    <Pressable
                        onPress={togglePlay}
                        style={[styles.playButton, { backgroundColor: theme.colors.accent?.primary ?? theme.colors.text.primary }]}
                        accessibilityRole="button"
                        accessibilityLabel={isPlaying ? t('files.pause') : t('files.play')}
                    >
                        <Text style={[styles.playButtonText, { color: theme.colors.surface.base }]}>
                            {isPlaying ? t('files.pause') : t('files.play')}
                        </Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 520,
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    title: {
        fontSize: 18,
        marginBottom: 20,
        textAlign: 'center',
        ...Typography.default('semiBold'),
    },
    webAudioWrapper: {
        width: '100%',
        marginTop: 8,
    },
    progressContainer: {
        width: '100%',
        marginVertical: 16,
    },
    progressBarBackground: {
        height: 6,
        borderRadius: 3,
        width: '100%',
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 3,
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        marginTop: 6,
    },
    timeText: {
        fontSize: 12,
        ...Typography.default(),
    },
    controlsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 12,
    },
    playButton: {
        paddingHorizontal: 28,
        paddingVertical: 12,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    playButtonText: {
        fontSize: 15,
        ...Typography.default('semiBold'),
    },
});

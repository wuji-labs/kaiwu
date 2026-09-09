import * as React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { HtmlDocumentPreview } from '@/components/sessions/files/content/documentPreview/HtmlDocumentPreview';

export type VideoPreviewPanelProps = Readonly<{
    uri: string;
    theme: any;
    fileName: string;
    mimeType?: string | null;
}>;

export function VideoPreviewPanel(props: VideoPreviewPanelProps) {
    const { uri, theme, mimeType } = props;

    if (Platform.OS === 'web') {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.surface.base }]}>
                <View style={styles.webVideoWrapper}>
                    <video
                        controls
                        playsInline
                        src={uri}
                        style={{
                            width: '100%',
                            maxHeight: '100%',
                            backgroundColor: '#000000',
                            borderRadius: 8,
                            outline: 'none',
                        }}
                    />
                </View>
            </View>
        );
    }

    // Native (iOS & Android): Load inside HtmlDocumentPreview (WebView) via <video controls>
    // This avoids adding expo-video (which requires native modules / dev-client recompile)
    // and natively leverages WebKit / Chromium video decoders.
    const html = React.useMemo(() => {
        const bg = theme.colors.surface.base;
        const typeAttr = mimeType ? `type="${mimeType}"` : '';
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: ${bg};
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
    video {
      width: 100%;
      height: 100%;
      max-width: 100vw;
      max-height: 100vh;
      object-fit: contain;
      background: #000000;
    }
  </style>
</head>
<body>
  <video controls playsinline autoplay=false preload="metadata" ${typeAttr}>
    <source src="${uri}" ${typeAttr}>
    Your browser or device does not support the video tag.
  </video>
</body>
</html>`;
    }, [mimeType, theme, uri]);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface.base }]}>
            <HtmlDocumentPreview html={html} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        height: '100%',
        minHeight: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
    webVideoWrapper: {
        width: '100%',
        height: '100%',
        maxWidth: 960,
        maxHeight: '100%',
        padding: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

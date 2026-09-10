import * as React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

export type HtmlDocumentPreviewProps = Readonly<{
    html: string;
    style?: any;
    testID?: string;
    onMessage?: (event: any) => void;
    injectedJavaScript?: string;
    injectedJavaScriptBeforeContentLoaded?: string;
}>;

export function HtmlDocumentPreview(props: HtmlDocumentPreviewProps) {
    const {
        html,
        style,
        testID,
        onMessage,
        injectedJavaScript,
        injectedJavaScriptBeforeContentLoaded,
    } = props;

    if (Platform.OS === 'web') {
        return (
            <View style={[styles.container, style]} testID={testID}>
                {/* On web, render sandboxed iframe with srcDoc */}
                <iframe
                    title="document-preview"
                    srcDoc={html}
                    sandbox="allow-scripts allow-same-origin"
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        display: 'block',
                        backgroundColor: 'transparent',
                    }}
                />
            </View>
        );
    }

    return (
        <View style={[styles.container, style]} testID={testID}>
            <WebView
                source={{ html }}
                style={styles.webView}
                originWhitelist={['*']}
                mixedContentMode="never"
                allowFileAccess={true}
                allowUniversalAccessFromFileURLs={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                injectedJavaScript={injectedJavaScript}
                injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
                onMessage={onMessage}
                scrollEnabled={true}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
    },
    webView: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});

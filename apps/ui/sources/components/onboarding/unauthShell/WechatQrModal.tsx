import React from 'react';
import { Image, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Typography } from '@/constants/Typography';
import { type CustomModalInjectedProps } from '@/modal';
import { useModalCardChrome } from '@/modal/components/card/useModalCardChrome';
import { RoundButton } from '@/components/ui/buttons/RoundButton';
import { Text } from '@/components/ui/text/Text';

const WECHAT_QR_IMAGE = require('@/assets/images/wechat-qr.png');

const stylesheet = StyleSheet.create((theme) => ({
    body: {
        paddingHorizontal: 24,
        paddingVertical: 20,
        alignItems: 'center',
        gap: 16,
    },
    qrContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    qrImage: {
        width: 220,
        height: 220,
    },
    hint: {
        fontSize: 14,
        color: theme.colors.text.secondary,
        textAlign: 'center',
        lineHeight: 20,
        ...Typography.default(),
    },
    footerContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
        alignItems: 'stretch',
    },
}));

export function WechatQrModal(props: CustomModalInjectedProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;

    const footer = React.useMemo(() => (
        <View style={styles.footerContent}>
            <RoundButton
                title="关闭"
                onPress={props.onClose}
                size="normal"
            />
        </View>
    ), [props.onClose, styles.footerContent]);

    const chrome = React.useMemo(() => ({
        kind: 'card' as const,
        title: '微信交流',
        testID: 'wechat-qr-modal',
        closeButtonTestID: 'wechat-qr-close',
        bodyScroll: 'auto' as const,
        footer,
        dimensions: { width: 340, maxHeightRatio: 0.85, size: 'dialog' as const },
    }), [footer]);

    useModalCardChrome(props.setChrome, chrome);

    return (
        <View style={styles.body}>
            <View style={styles.qrContainer}>
                <Image
                    source={WECHAT_QR_IMAGE}
                    style={styles.qrImage}
                    resizeMode="contain"
                />
            </View>
            <Text style={styles.hint}>
                打开微信「扫一扫」添加交流
            </Text>
        </View>
    );
}

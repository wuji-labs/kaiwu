import React, { memo, useCallback, useState } from 'react';
import { View, Platform, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { Modal, type CustomModalInjectedProps } from '@/modal';
import { Item } from '@/components/ui/lists/Item';
import { ItemGroup } from '@/components/ui/lists/ItemGroup';
import { RoundButton } from '@/components/ui/buttons/RoundButton';
import { Text, TextInput } from '@/components/ui/text/Text';
import { reportPublicShare } from '@/sync/api/social/apiSharing';
import { useAuth } from '@/auth/context/AuthContext';

export interface PublicShareReportDialogProps {
    token: string;
}

const REPORT_REASONS = [
    { key: 'inappropriate_content', labelKey: 'session.sharing.reportReasonInappropriate' as const },
    { key: 'spam', labelKey: 'session.sharing.reportReasonSpam' as const },
    { key: 'harassment', labelKey: 'session.sharing.reportReasonHarassment' as const },
    { key: 'copyright', labelKey: 'session.sharing.reportReasonCopyright' as const },
    { key: 'other', labelKey: 'session.sharing.reportReasonOther' as const },
] as const;

export const PublicShareReportDialog = memo(function PublicShareReportDialog({
    token,
    onClose,
}: PublicShareReportDialogProps & CustomModalInjectedProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const { credentials } = useAuth();
    const [selectedReason, setSelectedReason] = useState<string>('inappropriate_content');
    const [details, setDetails] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = useCallback(async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            await reportPublicShare(
                token,
                {
                    reason: selectedReason,
                    details: details.trim() || undefined,
                },
                credentials ?? undefined,
            );
            onClose();
            Modal.alert(
                t('session.sharing.reportSuccessTitle'),
                t('session.sharing.reportSuccessMessage'),
            );
        } catch (error) {
            Modal.alert(
                t('common.error'),
                error instanceof Error ? error.message : t('session.sharing.reportFailed'),
            );
        } finally {
            setIsSubmitting(false);
        }
    }, [credentials, details, isSubmitting, onClose, selectedReason, token]);

    const Radio = ({ selected }: { selected: boolean }) => (
        <View style={[styles.radioOuter, selected ? styles.radioActive : styles.radioInactive]}>
            {selected ? <View style={styles.radioDot} /> : null}
        </View>
    );

    return (
        <View style={styles.body}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
                nestedScrollEnabled
            >
                <ItemGroup title={t('session.sharing.reportReason')}>
                    {REPORT_REASONS.map((r, idx) => (
                        <Item
                            key={r.key}
                            testID={`report-reason-${r.key}`}
                            title={t(r.labelKey)}
                            leftElement={<Radio selected={selectedReason === r.key} />}
                            selected={selectedReason === r.key}
                            onPress={() => setSelectedReason(r.key)}
                            showChevron={false}
                            showDivider={idx < REPORT_REASONS.length - 1}
                        />
                    ))}
                </ItemGroup>

                <ItemGroup title={t('session.sharing.reportDetails')}>
                    <View style={styles.inputContainer}>
                        <TextInput
                            testID="report-details-input"
                            multiline
                            numberOfLines={3}
                            placeholder={t('session.sharing.reportDetailsPlaceholder')}
                            placeholderTextColor={theme.colors.input.placeholder}
                            value={details}
                            onChangeText={setDetails}
                            style={styles.textInput}
                            maxLength={1000}
                        />
                    </View>
                </ItemGroup>

                <View style={styles.buttonContainer}>
                    <RoundButton
                        testID="report-submit-button"
                        title={isSubmitting ? t('session.sharing.reportSubmitting') : t('session.sharing.reportSubmit')}
                        onPress={handleSubmit}
                        disabled={isSubmitting}
                        size="large"
                        style={{ width: '100%' }}
                    />
                </View>
            </ScrollView>
        </View>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    body: {
        flex: 1,
        minHeight: 0,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 24,
        flexGrow: 1,
    },
    inputContainer: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    textInput: {
        ...Typography.default('regular'),
        backgroundColor: theme.colors.input.background,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: Platform.select({ ios: 10, default: 12 }),
        fontSize: Platform.select({ ios: 16, default: 15 }),
        lineHeight: 22,
        color: theme.colors.input.text,
        minHeight: 80,
        textAlignVertical: 'top',
        ...(Platform.select({
            web: {
                outline: 'none',
                outlineStyle: 'none',
                outlineWidth: 0,
                outlineColor: 'transparent',
                boxShadow: 'none',
                WebkitBoxShadow: 'none',
                WebkitAppearance: 'none',
            },
            default: {},
        }) as any),
    },
    buttonContainer: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    radioOuter: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioActive: {
        borderColor: theme.colors.radio.active,
    },
    radioInactive: {
        borderColor: theme.colors.radio.inactive,
    },
    radioDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: theme.colors.radio.dot,
    },
}));

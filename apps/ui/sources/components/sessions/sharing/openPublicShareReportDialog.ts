import { Modal } from '@/modal';
import { t } from '@/text';

export async function openPublicShareReportDialog(token: string): Promise<string> {
    const { PublicShareReportDialog } = await import('./components/PublicShareReportDialog');
    const modalId = Modal.show({
        component: PublicShareReportDialog,
        props: {
            token,
        },
        chrome: {
            kind: 'card',
            title: t('session.sharing.reportTitle'),
            testID: 'public-share-report-dialog',
            layout: 'fill',
            dimensions: { width: 520, maxHeightRatio: 0.85, size: 'md' },
        },
        closeOnBackdrop: true,
    });
    return modalId;
}

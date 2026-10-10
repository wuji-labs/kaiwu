import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import renderer, { act } from 'react-test-renderer';
import { Linking } from 'react-native';
import { SettingsBelowFoldSections } from './SettingsBelowFoldSections';

vi.mock('react-native', () => ({
    Platform: { OS: 'android' },
    Linking: {
        canOpenURL: vi.fn().mockResolvedValue(true),
        openURL: vi.fn().mockResolvedValue(undefined),
    },
    View: 'View',
}));

vi.mock('expo-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('react-native-unistyles', () => ({
    useUnistyles: () => ({
        theme: {
            colors: {
                surface: { base: '#fff' },
                text: { primary: '#000', secondary: '#666' },
                accent: { orange: '#f90', purple: '#90f', blue: '#09f', indigo: '#4b0082' },
                state: { danger: { foreground: '#f00' }, success: { foreground: '#0f0' } },
            },
        },
    }),
}));

vi.mock('@/components/ui/lists/Item', () => ({
    Item: (props: any) => React.createElement('Item', props),
}));

vi.mock('@/components/ui/lists/ItemGroup', () => ({
    ItemGroup: (props: any) => React.createElement('ItemGroup', props, props.children),
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/track', () => ({
    trackWhatsNewClicked: vi.fn(),
}));

vi.mock('@/utils/system/requestReview', () => ({
    requestReview: vi.fn(),
}));

vi.mock('@/components/ui/icons/Icon', () => ({
    Icon: (props: any) => React.createElement('Icon', props),
    ICON_SIZE: { lg: 24 },
}));

describe('SettingsBelowFoldSections ICP filing', () => {
    it('renders the MIIT ICP filing number below version and opens beian URL on press', async () => {
        const dummyRouter = { push: vi.fn() } as any;
        const dummyTheme = {
            colors: {
                surface: { base: '#fff' },
                text: { primary: '#000', secondary: '#666' },
                accent: { orange: '#f90', purple: '#90f', blue: '#09f', indigo: '#4b0082' },
                state: { danger: { foreground: '#f00' }, success: { foreground: '#0f0' } },
            },
        } as any;

        let component!: renderer.ReactTestRenderer;
        await act(async () => {
            component = renderer.create(
                <SettingsBelowFoldSections
                    appVersion="0.2.24"
                    attachmentsUploadsEnabled={false}
                    automationsNeedLocalEnablement={false}
                    connectedServicesEnabled={false}
                    devModeEnabled={false}
                    executionRunsEnabled={false}
                    handleGitHub={() => {}}
                    handleReportIssue={() => {}}
                    handleVersionClick={() => {}}
                    mcpServersEnabled={false}
                    memorySearchEnabled={false}
                    promptsLibraryEnabled={false}
                    router={dummyRouter}
                    showAutomations={false}
                    showChangelog={false}
                    showRateUs={false}
                    sourceControlEnabled={false}
                    stage={4}
                    terminalUseTmux={false}
                    theme={dummyTheme}
                    useProfiles={false}
                    voiceEnabled={false}
                />
            );
        });

        const items = component.root.findAllByType('Item' as any);
        const versionIndex = items.findIndex((i: any) => i.props.title === 'common.version');
        expect(versionIndex).toBeGreaterThanOrEqual(0);

        const icpItem = items.find((i: any) => i.props.title === '苏ICP备2026038842号-5A');
        expect(icpItem).toBeDefined();

        const icpIndex = items.findIndex((i: any) => i.props.title === '苏ICP备2026038842号-5A');
        expect(icpIndex).toBe(versionIndex + 1);

        await act(async () => {
            await icpItem.props.onPress();
        });

        expect(Linking.canOpenURL).toHaveBeenCalledWith('https://beian.miit.gov.cn/');
        expect(Linking.openURL).toHaveBeenCalledWith('https://beian.miit.gov.cn/');
    });
});

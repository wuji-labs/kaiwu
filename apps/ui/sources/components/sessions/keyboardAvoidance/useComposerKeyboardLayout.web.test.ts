import { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, standardCleanup } from '@/dev/testkit';

const webHookState = vi.hoisted(() => ({
    windowHeight: 800,
}));

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock({
        useWindowDimensions: () => ({
            width: 1024,
            height: webHookState.windowHeight,
            scale: 1,
            fontScale: 1,
        }),
    });
});

vi.mock('react-native-reanimated', async () => {
    const React = await import('react');
    return {
        useSharedValue: <T,>(value: T) => React.useRef({ value }).current,
    };
});

describe('useComposerKeyboardLayout web', () => {
    beforeEach(() => {
        standardCleanup();
        webHookState.windowHeight = 800;
    });

    it('does not reserve the measured composer height inside the transcript inset', async () => {
        const { useComposerKeyboardLayout } = await import('./useComposerKeyboardLayout.web');
        const hook = await renderHook(() => useComposerKeyboardLayout({
            headerHeight: 100,
            safeAreaBottom: 0,
        }));

        act(() => {
            hook.getCurrent().setComposerMeasuredHeight(127);
        });

        expect(hook.getCurrent().composerHeight.value).toBe(127);
        expect(hook.getCurrent().listBottomInset.value).toBe(0);
    });

    it('caps available panel height to the measured scaffold container', async () => {
        const { useComposerKeyboardLayout } = await import('./useComposerKeyboardLayout.web');
        const hook = await renderHook(() => useComposerKeyboardLayout({
            availablePanelMaxHeight: 420,
            headerHeight: 100,
            safeAreaBottom: 0,
        }));

        expect(hook.getCurrent().availablePanelHeight.value).toBe(420);
    });

    it('resets window scroll on focusin to prevent iOS Safari double-lift', async () => {
        const listeners: Record<string, (e?: unknown) => void> = {};
        const scrollToSpy = vi.fn();
        const fakeWindow = {
            scrollY: 150,
            scrollX: 0,
            scrollTo: scrollToSpy,
            innerHeight: 800,
            addEventListener: vi.fn((event: string, handler: (e?: unknown) => void) => {
                listeners[event] = handler;
            }),
            removeEventListener: vi.fn(),
            visualViewport: {
                height: 500,
                width: 375,
                offsetTop: 0,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            },
        };
        (globalThis as any).window = fakeWindow;
        try {
            const { useComposerKeyboardLayout } = await import('./useComposerKeyboardLayout.web');
            await renderHook(() => useComposerKeyboardLayout({
                headerHeight: 0,
                safeAreaBottom: 0,
            }));

            act(() => {
                listeners.focusin?.();
            });

            expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
        } finally {
            delete (globalThis as any).window;
        }
    });
});

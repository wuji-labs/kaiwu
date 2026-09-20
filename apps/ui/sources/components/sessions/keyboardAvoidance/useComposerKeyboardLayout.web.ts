import * as React from 'react';
import { useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { resolveWebVisualViewportKeyboardInset } from '@/hooks/ui/resolveWebVisualViewportKeyboardInset';
import {
    resolveAvailablePanelHeight,
    resolveComposerBottomOffset,
} from './composerKeyboardGeometry';
import type { ComposerKeyboardLayout } from './ComposerKeyboardContext';
import type { ComposerKeyboardLayoutOptions } from './useComposerKeyboardLayout.native';

function isEditableElementFocused(): boolean {
    if (typeof document === 'undefined') return false;
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    const tagName = activeElement.tagName.toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || activeElement.getAttribute('contenteditable') === 'true';
}

function isMobileLikeHost(width: number): boolean {
    return width < 768;
}

function getWindowScrollY(): number {
    if (typeof window === 'undefined') return 0;
    const documentScrollTop = typeof document !== 'undefined'
        ? (document.documentElement?.scrollTop || document.body?.scrollTop || 0)
        : 0;
    return Math.max(0, window.scrollY || window.pageYOffset || documentScrollTop || 0);
}

function resetWindowScroll(): void {
    if (typeof window === 'undefined') return;
    if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
    }
    if (typeof document !== 'undefined') {
        if (document.documentElement && (document.documentElement.scrollTop !== 0 || document.documentElement.scrollLeft !== 0)) {
            document.documentElement.scrollTop = 0;
            document.documentElement.scrollLeft = 0;
        }
        if (document.body && (document.body.scrollTop !== 0 || document.body.scrollLeft !== 0)) {
            document.body.scrollTop = 0;
            document.body.scrollLeft = 0;
        }
    }
}

function readVisualViewportKeyboardInset(): number {
    if (typeof window === 'undefined') return 0;
    const visualViewport = window.visualViewport;
    if (!visualViewport) return 0;
    return resolveWebVisualViewportKeyboardInset({
        layoutViewportHeight: window.innerHeight,
        visualViewportHeight: visualViewport.height,
        visualViewportOffsetTop: visualViewport.offsetTop,
        windowScrollY: getWindowScrollY(),
        isEditableElementFocused: isEditableElementFocused(),
        isMobileLikeHost: isMobileLikeHost(visualViewport.width),
    });
}

export function useComposerKeyboardLayout(options: ComposerKeyboardLayoutOptions = {}): ComposerKeyboardLayout {
    const dimensions = useWindowDimensions();
    const safeAreaBottom = options.safeAreaBottom ?? 0;
    const headerHeight = options.headerHeight ?? 0;
    const availablePanelMaxHeight = typeof options.availablePanelMaxHeight === 'number' && Number.isFinite(options.availablePanelMaxHeight)
        ? Math.max(0, options.availablePanelMaxHeight)
        : undefined;
    const keyboardLiftSuppressed = options.keyboardLiftSuppressed === true;
    const availablePanelHeight = useSharedValue(0);
    const bottomInset = useSharedValue(resolveComposerBottomOffset({ keyboardHeight: 0, safeAreaBottom }));
    const composerHeight = useSharedValue(0);
    const isKeyboardLiftSuppressed = useSharedValue(keyboardLiftSuppressed);
    const keyboardHeightForInset = useSharedValue(0);
    const keyboardHeightLive = useSharedValue(0);
    const keyboardProgress = useSharedValue(0);
    const listBottomInset = useSharedValue(0);
    const availablePanelHeightSubscribersRef = React.useRef(new Set<(height: number) => void>());
    const keyboardHeightSnapshotRef = React.useRef(0);
    const keyboardHeightSubscribersRef = React.useRef(new Set<(height: number) => void>());
    const listBottomInsetSubscribersRef = React.useRef(new Set<(height: number) => void>());

    const notifyAvailablePanelHeight = React.useCallback((height: number) => {
        for (const listener of availablePanelHeightSubscribersRef.current) {
            listener(height);
        }
    }, []);

    const subscribeAvailablePanelHeight = React.useCallback((listener: (height: number) => void) => {
        availablePanelHeightSubscribersRef.current.add(listener);
        listener(availablePanelHeight.value);
        return () => {
            availablePanelHeightSubscribersRef.current.delete(listener);
        };
    }, [availablePanelHeight]);

    const notifyKeyboardHeight = React.useCallback((height: number) => {
        const nextHeight = typeof height === 'number' && Number.isFinite(height) ? Math.max(0, Math.trunc(height)) : 0;
        if (keyboardHeightSnapshotRef.current === nextHeight) return;
        keyboardHeightSnapshotRef.current = nextHeight;
        for (const listener of keyboardHeightSubscribersRef.current) {
            listener(nextHeight);
        }
    }, []);

    const getKeyboardHeight = React.useCallback(() => keyboardHeightSnapshotRef.current, []);

    const subscribeKeyboardHeight = React.useCallback((listener: (height: number) => void) => {
        keyboardHeightSubscribersRef.current.add(listener);
        listener(keyboardHeightSnapshotRef.current);
        return () => {
            keyboardHeightSubscribersRef.current.delete(listener);
        };
    }, []);

    const notifyListBottomInset = React.useCallback((height: number) => {
        for (const listener of listBottomInsetSubscribersRef.current) {
            listener(height);
        }
    }, []);

    const subscribeListBottomInset = React.useCallback((listener: (height: number) => void) => {
        listBottomInsetSubscribersRef.current.add(listener);
        listener(listBottomInset.value);
        return () => {
            listBottomInsetSubscribersRef.current.delete(listener);
        };
    }, [listBottomInset]);

    const recompute = React.useCallback((keyboardHeight: number) => {
        const effectiveKeyboardHeight = keyboardLiftSuppressed ? 0 : keyboardHeight;
        isKeyboardLiftSuppressed.value = keyboardLiftSuppressed;
        keyboardHeightLive.value = keyboardHeight;
        keyboardHeightForInset.value = keyboardHeight;
        keyboardProgress.value = keyboardHeight > 0 ? 1 : 0;
        notifyKeyboardHeight(effectiveKeyboardHeight);
        bottomInset.value = resolveComposerBottomOffset({ keyboardHeight: effectiveKeyboardHeight, safeAreaBottom });
        listBottomInset.value = 0;
        notifyListBottomInset(0);
        availablePanelHeight.value = resolveAvailablePanelHeight({
            viewportHeight: dimensions.height,
            headerHeight,
            keyboardHeight: effectiveKeyboardHeight,
            maxHeight: availablePanelMaxHeight,
            safeAreaBottom,
        });
        notifyAvailablePanelHeight(availablePanelHeight.value);
    }, [
        availablePanelHeight,
        availablePanelMaxHeight,
        bottomInset,
        composerHeight,
        dimensions.height,
        headerHeight,
        isKeyboardLiftSuppressed,
        keyboardHeightForInset,
        keyboardHeightLive,
        keyboardLiftSuppressed,
        keyboardProgress,
        listBottomInset,
        notifyKeyboardHeight,
        notifyListBottomInset,
        notifyAvailablePanelHeight,
        safeAreaBottom,
    ]);

    React.useEffect(() => {
        let scrollResetRafId: number | null = null;
        let scrollResetTimerId: ReturnType<typeof setTimeout> | null = null;

        const cancelPendingScrollResets = () => {
            if (scrollResetRafId !== null) {
                cancelAnimationFrame(scrollResetRafId);
                scrollResetRafId = null;
            }
            if (scrollResetTimerId !== null) {
                clearTimeout(scrollResetTimerId);
                scrollResetTimerId = null;
            }
        };

        const update = () => {
            recompute(readVisualViewportKeyboardInset());
        };

        const handleFocusIn = () => {
            update();
            cancelPendingScrollResets();
            // Counteract iOS Safari's native auto-scroll on focus. Even in an SPA with body overflow:hidden,
            // WebKit forcibly scrolls window.scrollY when focusing an input near the bottom. Resetting
            // window scroll ensures the composer does not suffer from double-lift displacement.
            resetWindowScroll();
            if (typeof requestAnimationFrame !== 'undefined') {
                scrollResetRafId = requestAnimationFrame(() => {
                    resetWindowScroll();
                    update();
                    scrollResetTimerId = setTimeout(() => {
                        resetWindowScroll();
                        update();
                    }, 80);
                });
            }
        };

        const handleFocusOut = () => {
            cancelPendingScrollResets();
            resetWindowScroll();
            update();
        };

        update();
        if (typeof window === 'undefined') return undefined;
        const visualViewport = window.visualViewport;
        visualViewport?.addEventListener('resize', update);
        visualViewport?.addEventListener('scroll', update);
        window.addEventListener('scroll', update, { passive: true });
        window.addEventListener('focusin', handleFocusIn);
        window.addEventListener('focusout', handleFocusOut);
        return () => {
            cancelPendingScrollResets();
            visualViewport?.removeEventListener('resize', update);
            visualViewport?.removeEventListener('scroll', update);
            window.removeEventListener('scroll', update);
            window.removeEventListener('focusin', handleFocusIn);
            window.removeEventListener('focusout', handleFocusOut);
        };
    }, [recompute]);

    const setComposerMeasuredHeight = React.useCallback((height: number) => {
        const nextHeight = typeof height === 'number' && Number.isFinite(height) ? Math.max(0, Math.round(height)) : 0;
        if (composerHeight.value === nextHeight) return;
        composerHeight.value = nextHeight;
        recompute(keyboardHeightForInset.value);
    }, [composerHeight, keyboardHeightForInset, recompute]);

    const retainKeyboardLift = React.useCallback(() => () => {}, []);

    return React.useMemo(() => ({
        availablePanelHeight,
        bottomInset,
        composerHeight,
        getKeyboardHeight,
        isKeyboardLiftSuppressed,
        keyboardHeightForInset,
        keyboardHeightLive,
        keyboardProgress,
        listBottomInset,
        // On web the composer sits in normal layout flow and the visual-viewport inset is
        // applied synchronously on the only thread there is, so the settled total is already
        // the continuously tracked one.
        listBottomInsetAnimated: listBottomInset,
        retainKeyboardLift,
        setComposerMeasuredHeight,
        subscribeAvailablePanelHeight,
        subscribeKeyboardHeight,
        subscribeListBottomInset,
    }), [
        availablePanelHeight,
        bottomInset,
        composerHeight,
        getKeyboardHeight,
        isKeyboardLiftSuppressed,
        keyboardHeightForInset,
        keyboardHeightLive,
        keyboardProgress,
        listBottomInset,
        retainKeyboardLift,
        setComposerMeasuredHeight,
        subscribeAvailablePanelHeight,
        subscribeKeyboardHeight,
        subscribeListBottomInset,
    ]);
}

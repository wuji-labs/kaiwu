export const MIN_WEB_SOFTWARE_KEYBOARD_INSET_PX = 80;

export type WebVisualViewportKeyboardInsetParams = Readonly<{
    isEditableElementFocused: boolean;
    isMobileLikeHost: boolean;
    layoutViewportHeight: number;
    visualViewportHeight: number;
    visualViewportOffsetTop: number;
    windowScrollY?: number;
}>;

export function resolveWebVisualViewportKeyboardInset(params: WebVisualViewportKeyboardInsetParams): number {
    if (!params.isEditableElementFocused || !params.isMobileLikeHost) {
        return 0;
    }

    const layoutViewportHeight = Number(params.layoutViewportHeight);
    const visualViewportHeight = Number(params.visualViewportHeight);
    const visualViewportOffsetTop = Number(params.visualViewportOffsetTop);
    const windowScrollY = Number(params.windowScrollY ?? 0);
    if (
        !Number.isFinite(layoutViewportHeight)
        || !Number.isFinite(visualViewportHeight)
        || !Number.isFinite(visualViewportOffsetTop)
        || !Number.isFinite(windowScrollY)
    ) {
        return 0;
    }

    // On iOS Safari, focusing an input at the bottom of the screen triggers both a visualViewport
    // resize AND a native document scroll (window.scrollY > 0). If the layout padding-bottom also
    // lifts the full keyboard delta without accounting for windowScrollY, the composer is pushed
    // twice ("double lift") and thrown completely off the top of the visible screen.
    const effectiveScrollOffset = Math.max(0, visualViewportOffsetTop) + Math.max(0, windowScrollY);
    const inset = Math.max(0, layoutViewportHeight - visualViewportHeight - effectiveScrollOffset);
    if (inset < MIN_WEB_SOFTWARE_KEYBOARD_INSET_PX) {
        return 0;
    }

    return Math.round(inset);
}

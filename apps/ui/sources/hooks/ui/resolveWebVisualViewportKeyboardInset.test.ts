import { describe, expect, it } from 'vitest';

import {
    MIN_WEB_SOFTWARE_KEYBOARD_INSET_PX,
    resolveWebVisualViewportKeyboardInset,
} from './resolveWebVisualViewportKeyboardInset';

describe('resolveWebVisualViewportKeyboardInset', () => {
    it('returns zero when no editable element is focused', () => {
        expect(resolveWebVisualViewportKeyboardInset({
            layoutViewportHeight: 844,
            visualViewportHeight: 520,
            visualViewportOffsetTop: 0,
            isEditableElementFocused: false,
            isMobileLikeHost: true,
        })).toBe(0);
    });

    it('returns zero on non-mobile-like hosts', () => {
        expect(resolveWebVisualViewportKeyboardInset({
            layoutViewportHeight: 844,
            visualViewportHeight: 520,
            visualViewportOffsetTop: 0,
            isEditableElementFocused: true,
            isMobileLikeHost: false,
        })).toBe(0);
    });

    it('returns zero for small viewport deltas that look like browser chrome changes', () => {
        expect(resolveWebVisualViewportKeyboardInset({
            layoutViewportHeight: 844,
            visualViewportHeight: 844 - (MIN_WEB_SOFTWARE_KEYBOARD_INSET_PX - 1),
            visualViewportOffsetTop: 0,
            isEditableElementFocused: true,
            isMobileLikeHost: true,
        })).toBe(0);
    });

    it('returns the visual viewport delta for focused mobile-web keyboards', () => {
        expect(resolveWebVisualViewportKeyboardInset({
            layoutViewportHeight: 844,
            visualViewportHeight: 544,
            visualViewportOffsetTop: 0,
            isEditableElementFocused: true,
            isMobileLikeHost: true,
        })).toBe(300);
    });

    it('subtracts visual viewport offsetTop when the viewport is shifted', () => {
        expect(resolveWebVisualViewportKeyboardInset({
            layoutViewportHeight: 844,
            visualViewportHeight: 564,
            visualViewportOffsetTop: 24,
            isEditableElementFocused: true,
            isMobileLikeHost: true,
        })).toBe(256);
    });

    it('subtracts windowScrollY to prevent iOS Safari double-lift when browser auto-scrolls', () => {
        expect(resolveWebVisualViewportKeyboardInset({
            layoutViewportHeight: 844,
            visualViewportHeight: 544,
            visualViewportOffsetTop: 0,
            windowScrollY: 120,
            isEditableElementFocused: true,
            isMobileLikeHost: true,
        })).toBe(180);
    });

    it('returns zero when windowScrollY covers the keyboard delta', () => {
        expect(resolveWebVisualViewportKeyboardInset({
            layoutViewportHeight: 844,
            visualViewportHeight: 544,
            visualViewportOffsetTop: 0,
            windowScrollY: 300,
            isEditableElementFocused: true,
            isMobileLikeHost: true,
        })).toBe(0);
    });
});

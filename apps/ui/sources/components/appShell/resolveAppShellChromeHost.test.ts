import { describe, expect, it } from 'vitest';

import {
    resolveAppShellChromeHost,
    type ResolveAppShellChromeHostParams,
} from './resolveAppShellChromeHost';

describe('resolveAppShellChromeHost', () => {
    it('returns none for terminal-connect routes', () => {
        expect(resolveAppShellChromeHost({
            isAuthenticated: true,
            isWeb: true,
            isTauriDesktop: true,
            isTablet: true,
            isTerminalConnectRoute: true,
        })).toBe('none');
    });

    it('returns web-top-right for non-Tauri browser shells', () => {
        expect(resolveAppShellChromeHost({
            isAuthenticated: true,
            isWeb: true,
            isTauriDesktop: false,
            isTablet: true,
            isTerminalConnectRoute: false,
        })).toBe('web-top-right');
    });

    it('does not place root update chrome over native mobile headers', () => {
        const params = {
            isAuthenticated: true,
            isWeb: false,
            isTauriDesktop: false,
            isTablet: false,
            isTerminalConnectRoute: false,
        } as ResolveAppShellChromeHostParams & { isWeb: boolean };

        expect(resolveAppShellChromeHost(params)).toBe('none');
    });

    it('returns unauth-shell for unauthenticated Tauri desktop flows', () => {
        expect(resolveAppShellChromeHost({
            isAuthenticated: false,
            isWeb: true,
            isTauriDesktop: true,
            isTablet: true,
            isTerminalConnectRoute: false,
        })).toBe('unauth-shell');
    });

    it('returns narrow-desktop-fallback when authenticated Tauri desktop has no permanent sidebar host', () => {
        expect(resolveAppShellChromeHost({
            isAuthenticated: true,
            isWeb: true,
            isTauriDesktop: true,
            isTablet: false,
            isTerminalConnectRoute: false,
        })).toBe('narrow-desktop-fallback');
    });

    it('returns none for authenticated wide Tauri desktop because the sidebar hosts chrome', () => {
        expect(resolveAppShellChromeHost({
            isAuthenticated: true,
            isWeb: true,
            isTauriDesktop: true,
            isTablet: true,
            isTerminalConnectRoute: false,
        })).toBe('none');
    });
});

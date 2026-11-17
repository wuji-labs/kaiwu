import { useAuth } from '@/auth/context/AuthContext';
import * as React from 'react';
import { Stack, usePathname } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useIsTablet } from '@/utils/platform/responsive';
import { SidebarView } from './SidebarView';
import { CollapsedSidebarView } from './CollapsedSidebarView';
import { View, useWindowDimensions, Platform } from 'react-native';
import { useLocalSetting, useLocalSettingMutable } from '@/sync/domains/state/storage';
import { ResizableDockedPane, type ResizableDockedPaneCommitMeta } from '@/components/ui/panels/ResizableDockedPane';
import { PANE_SIZING_DEFAULTS, resolveScaledPaneWidthPx } from '@/components/appShell/panes/layout/paneSizing';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { resolveSidebarDockMaxWidthPx, SIDEBAR_COLLAPSED_WIDTH_PX, SIDEBAR_DOCK_MIN_WIDTH_PX } from './sidebarSizing';
import { useAppPaneContext } from '@/components/appShell/panes/AppPaneProvider';
import { resolvePaneFocusModeRouteScopeId } from '@/components/appShell/panes/focusMode/resolvePaneFocusModeRouteScopeId';
import { isTauriDesktop } from '@/utils/platform/tauri';
import { DesktopMainContentDragSurface } from '@/components/navigation/desktopWindowChrome/DesktopMainContentDragSurface';

const TERMINAL_CONNECT_ROUTE = '/terminal/connect';
const EXPANDED_SIDEBAR_MIN_WINDOW_WIDTH_PX = SIDEBAR_DOCK_MIN_WIDTH_PX + PANE_SIZING_DEFAULTS.mainMinPx;

function isTerminalConnectWebPathname(pathname: string | null | undefined): boolean {
    const route = String(pathname ?? '').split('?')[0]?.replace(/\/+$/, '');
    return route === TERMINAL_CONNECT_ROUTE;
}

/**
 * Radius on the sidebar-facing side of the content sheet only. The window-facing edges stay
 * square so the sheet reads as flush to the window and never stacks its own curve on top of
 * the OS window's rounded corners.
 */
const CONTENT_SHEET_SEAM_RADIUS_PX = 16;


const stylesheet = StyleSheet.create((theme) => ({
    desktopDrawerRoot: {
        flex: 1,
        position: 'relative',
        // The plane the content sheet lies on. Painted here so the sheet's rounded
        // sidebar-facing corners reveal the canvas rather than whatever is behind the app.
        backgroundColor: theme.colors.background.canvas,
    },
    /**
     * The seam shadow. An inert overlay tracing the content sheet's exact footprint — same left
     * corners, transparent fill — whose only job is to cast the sheet's lift shadow leftward onto
     * the sidebar.
     *
     * It has to be a separate element: react-navigation wraps the scene in an overflow:hidden
     * container, so a shadow declared on the scene itself is clipped at the seam and never reaches
     * the sidebar.
     *
     * It has to be sheet-SHAPED rather than a strip: a straight strip casts a straight-edged band
     * that runs on past the rounded corners, so the shadow and the edge it describes disagree.
     * Matching the radii makes the cast follow the curve.
     *
     * x-offset only with no spread — the offset keeps the cast on the sidebar side, and the top,
     * right and bottom casts fall beyond the window edges where nothing can show them. Dark needs
     * roughly 3x the alpha to register over a dark canvas.
     */
    contentSheetSeamShadow: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        right: 0,
        borderTopLeftRadius: CONTENT_SHEET_SEAM_RADIUS_PX,
        borderBottomLeftRadius: CONTENT_SHEET_SEAM_RADIUS_PX,
        zIndex: 2,
        boxShadow: theme.dark
            ? '-5px 0 22px rgba(0, 0, 0, 0.13)'
            : '-5px 0 22px rgba(0, 0, 0, 0.035)',
    },
}));

export type SidebarNavigatorProps = Readonly<{
    desktopUpdateIndicator?: React.ReactNode;
}>;

export const SidebarNavigator = React.memo((props: SidebarNavigatorProps) => {
    const styles = stylesheet;
    const auth = useAuth();
    const isTablet = useIsTablet();
    const pathname = usePathname();
    const bypassDesktopDrawerShell = Platform.OS === 'web' && isTerminalConnectWebPathname(pathname);
    const desktopDrawerEnabled = auth.isAuthenticated && isTablet;
    const showPermanentDrawer = desktopDrawerEnabled;
    const routeScopeId = React.useMemo(() => resolvePaneFocusModeRouteScopeId(pathname), [pathname]);
    const { state: paneState, dispatch: dispatchPaneAction } = useAppPaneContext();
    const focusedScopeId = paneState.focusMode.scopeId;
    const focusedScope = focusedScopeId ? paneState.scopes[focusedScopeId] : undefined;
    const paneFocusModeChromeActive =
        Boolean(focusedScopeId)
        && focusedScopeId === routeScopeId
        && paneState.activeScopeId === focusedScopeId
        && Boolean(focusedScope?.right.isOpen || focusedScope?.details.isOpen);
    const { theme } = useUnistyles();
    const { width: windowWidth } = useWindowDimensions();
    const sidebarCollapsed = useLocalSetting('sidebarCollapsed');
    const [, setSidebarCollapsed] = useLocalSettingMutable('sidebarCollapsed');
    const sidebarWidthPx = useLocalSetting('sidebarWidthPx');
    const sidebarWidthBasisPx = useLocalSetting('sidebarWidthBasisPx');
    const [, setSidebarWidthPx] = useLocalSettingMutable('sidebarWidthPx');
    const [, setSidebarWidthBasisPx] = useLocalSettingMutable('sidebarWidthBasisPx');
    const [dragSidebarWidthPx, setDragSidebarWidthPx] = React.useState<number | null>(null);
    const collapseTriggeredDuringDragRef = React.useRef(false);
    const forceCompactSidebarForViewport =
        Platform.OS === 'web'
        && showPermanentDrawer
        && Number.isFinite(windowWidth)
        && windowWidth < EXPANDED_SIDEBAR_MIN_WINDOW_WIDTH_PX;
    const effectiveSidebarCollapsed = Boolean(sidebarCollapsed || paneFocusModeChromeActive || forceCompactSidebarForViewport);

    React.useEffect(() => {
        if (!focusedScopeId) return;
        if (focusedScopeId !== routeScopeId) {
            dispatchPaneAction({ type: 'exitFocusMode', scopeId: focusedScopeId });
            return;
        }
        if (!focusedScope?.right.isOpen && !focusedScope?.details.isOpen) {
            dispatchPaneAction({ type: 'exitFocusMode', scopeId: focusedScopeId });
        }
    }, [
        dispatchPaneAction,
        focusedScope?.details.isOpen,
        focusedScope?.right.isOpen,
        focusedScopeId,
        routeScopeId,
    ]);

    const stopScrollEventPropagationOnWeb = React.useCallback((event: any) => {
        // Expo Router (Vaul/Radix) modals on web often install document-level scroll-lock listeners
        // that `preventDefault()` wheel/touch scroll, which breaks scrolling inside nested scroll views
        // (including the permanent sidebar drawer). Stopping propagation here keeps scroll events
        // within the drawer subtree so native scrolling works.
        if (Platform.OS !== 'web') return;
        if (typeof event?.stopPropagation === 'function') event.stopPropagation();
    }, []);

    const sidebarMaxWidthPx = React.useMemo(() => resolveSidebarDockMaxWidthPx(windowWidth), [windowWidth]);

    const effectiveSidebarWidthPx = React.useMemo(() => {
        return resolveScaledPaneWidthPx({
            preferredWidthPx: sidebarWidthPx,
            basisContainerWidthPx: sidebarWidthBasisPx,
            containerWidthPx: windowWidth,
            minPx: SIDEBAR_DOCK_MIN_WIDTH_PX,
            maxPx: sidebarMaxWidthPx,
        });
    }, [sidebarMaxWidthPx, sidebarWidthBasisPx, sidebarWidthPx, windowWidth]);

    // Calculate drawer width only when needed
    const drawerWidth = React.useMemo(() => {
        if (!showPermanentDrawer) return 280; // default width; hidden drawers are not rendered
        if (effectiveSidebarCollapsed) return SIDEBAR_COLLAPSED_WIDTH_PX;
        return dragSidebarWidthPx ?? effectiveSidebarWidthPx;
    }, [dragSidebarWidthPx, effectiveSidebarCollapsed, effectiveSidebarWidthPx, showPermanentDrawer]);

    const handleSidebarWidthDrag = React.useCallback((nextWidthPx: number | null, dragMeta?: ResizableDockedPaneCommitMeta | null) => {
        if (nextWidthPx == null) {
            collapseTriggeredDuringDragRef.current = false;
            setDragSidebarWidthPx(null);
            return;
        }

        const shouldCollapseToCompactView =
            Platform.OS === 'web'
            && !effectiveSidebarCollapsed
            && !collapseTriggeredDuringDragRef.current
            && nextWidthPx <= SIDEBAR_DOCK_MIN_WIDTH_PX
            && dragMeta?.exceededMinPx === true;

        if (shouldCollapseToCompactView) {
            collapseTriggeredDuringDragRef.current = true;
            setDragSidebarWidthPx(null);
            setSidebarCollapsed(true);
            return;
        }

        setDragSidebarWidthPx(nextWidthPx);
    }, [effectiveSidebarCollapsed, setSidebarCollapsed]);

    const handleSidebarWidthCommit = React.useCallback((nextWidthPx: number) => {
        collapseTriggeredDuringDragRef.current = false;
        setDragSidebarWidthPx(null);
        setSidebarWidthPx(nextWidthPx);
        setSidebarWidthBasisPx(windowWidth);
    }, [setSidebarWidthBasisPx, setSidebarWidthPx, windowWidth]);

    const handleCollapsedSidebarExpand = React.useCallback(() => {
        if (paneFocusModeChromeActive) {
            dispatchPaneAction({ type: 'exitFocusMode' });
        }
        setSidebarCollapsed(false);
    }, [dispatchPaneAction, paneFocusModeChromeActive, setSidebarCollapsed]);

    const handleCollapsedSidebarExitFocusMode = React.useCallback(() => {
        if (paneFocusModeChromeActive) {
            dispatchPaneAction({ type: 'exitFocusMode' });
        }
    }, [dispatchPaneAction, paneFocusModeChromeActive]);

    const stackNavigationOptions = React.useMemo(() => ({
        lazy: false,
        headerShown: false,
    }), []);

    const drawerNavigationOptions = React.useMemo(() => {
        const base = {
            lazy: false,
            headerShown: false,
            swipeEnabled: false,
        };

        if (!desktopDrawerEnabled) {
            return {
                ...base,
                drawerType: 'front' as const,
                drawerStyle: {
                    width: 0,
                    display: 'none' as const,
                },
            };
        }

        // When the desktop drawer is disabled, ensure we do not
        // keep the permanent drawer layout slot around. Some drawer implementations can reserve
        // space even when the style width is set to 0. Switching to a front drawer avoids that
        // layout reservation while still preserving navigation state (no remount).
        if (!showPermanentDrawer) {
            return {
                ...base,
                drawerType: 'front' as const,
                drawerStyle: {
                    width: 0,
                    display: 'none' as const,
                },
            };
        }

        return {
            ...base,
            drawerType: 'permanent' as const,
            drawerStyle: {
                backgroundColor: theme.colors.background.canvas,
                // No right border: the seam is now the content sheet's rounded edge plus its
                // shadow. A border here would double the line and square off the sheet's curve.
                width: drawerWidth,
                // react-navigation stacks the permanent drawer at z-index 1, above the scene,
                // which swallows the sheet's left-cast shadow entirely. Dropping the drawer to
                // the default stacking order lets DOM order decide (drawer first, scene second),
                // so the sheet paints — and casts — over the sidebar as it should. Only the
                // permanent drawer is affected; sliding drawer types keep their own stacking.
                zIndex: 0,
            },
            // The content sheet: flush to the window on top/right/bottom, treated only on the
            // edge that meets the sidebar.
            //
            // Deliberately NO backgroundColor — each route keeps painting whatever it paints
            // today (sessions paint surface.base, some screens paint canvas), and this only
            // clips it. So the seam changes geometry, never tone.
            //
            // The lift shadow is x-offset with a NEGATIVE spread so it hugs the seam instead of
            // fanning across the sidebar. Web-only: a negative-spread, x-offset-only shadow is
            // not expressible in the native shadow API, so native keeps its hairline.
            sceneStyle: {
                borderTopLeftRadius: CONTENT_SHEET_SEAM_RADIUS_PX,
                borderBottomLeftRadius: CONTENT_SHEET_SEAM_RADIUS_PX,
                overflow: 'hidden' as const,
                // NOTE: the shadow is NOT cast from here. react-navigation wraps the scene in a
                // container with overflow:hidden, so a leftward shadow declared on this element
                // is clipped at the seam and never reaches the sidebar. It is drawn by the
                // dedicated seam overlay below instead.
                ...(Platform.OS === 'web'
                    ? {}
                    : {
                        borderLeftWidth: StyleSheet.hairlineWidth,
                        borderLeftColor: theme.colors.border.default,
                    }),
            },
            drawerActiveTintColor: 'transparent',
            drawerInactiveTintColor: 'transparent',
            drawerItemStyle: { display: 'none' as const },
            drawerLabelStyle: { display: 'none' as const },
        };
    }, [
        desktopDrawerEnabled,
        showPermanentDrawer,
        drawerWidth,
        theme.colors.border.default,
        theme.colors.background.canvas,
        theme.dark,
    ]);

    // Always render SidebarView but hide it when not needed
    const drawerContent = React.useCallback(
        () => {
            if (effectiveSidebarCollapsed) {
                return (
                    <CollapsedSidebarView
                        desktopUpdateIndicator={props.desktopUpdateIndicator}
                        focusModeActive={paneFocusModeChromeActive}
                        onExitFocusMode={handleCollapsedSidebarExitFocusMode}
                        onRequestExpand={handleCollapsedSidebarExpand}
                    />
                );
            }
            return (
                <ResizableDockedPane
                    widthPx={drawerWidth}
                    minWidthPx={SIDEBAR_DOCK_MIN_WIDTH_PX}
                    maxWidthPx={sidebarMaxWidthPx}
                    resizeEdge="right"
                    onDragWidthPx={handleSidebarWidthDrag}
                    onCommitWidthPx={handleSidebarWidthCommit}
                >
                    <View
                        style={{ flex: 1, flexShrink: 0, minHeight: 0 }}
                        {...(Platform.OS === 'web'
                            ? ({ onWheel: stopScrollEventPropagationOnWeb, onTouchMove: stopScrollEventPropagationOnWeb } as any)
                            : {})}
                    >
                        <SidebarView
                            sidebarWidthPx={drawerWidth}
                            desktopUpdateIndicator={props.desktopUpdateIndicator}
                        />
                    </View>
                </ResizableDockedPane>
            );
        },
        [
            drawerWidth,
            effectiveSidebarCollapsed,
            handleCollapsedSidebarExpand,
            handleCollapsedSidebarExitFocusMode,
            handleSidebarWidthCommit,
            handleSidebarWidthDrag,
            paneFocusModeChromeActive,
            props.desktopUpdateIndicator,
            sidebarMaxWidthPx,
        ]
    );

    if (!desktopDrawerEnabled || bypassDesktopDrawerShell) {
        return <Stack screenOptions={stackNavigationOptions} />;
    }

    return (
        <DesktopMainContentDragSurface
            enabled={Platform.OS === 'web' && isTauriDesktop()}
            leftOffsetPx={drawerWidth}
            style={styles.desktopDrawerRoot}
        >
            <Drawer
                screenOptions={drawerNavigationOptions}
                drawerContent={showPermanentDrawer ? drawerContent : undefined}
            />
            {Platform.OS === 'web' && showPermanentDrawer ? (
                <View
                    pointerEvents="none"
                    style={[styles.contentSheetSeamShadow, { left: drawerWidth }]}
                />
            ) : null}
        </DesktopMainContentDragSurface>
    );
});

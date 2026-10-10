/** Resolves the current theme into the flat color set the diff rows read. */

import * as React from 'react';
import { useUnistyles } from 'react-native-unistyles';
import type { SpanKind } from './engine/types';

export interface DiffPalette {
    surface: string;
    rowBg: Record<'add' | 'del' | 'ctx', string>;
    gutterBg: Record<'add' | 'del' | 'ctx', string>;
    gutterBorder: string;
    lineNumber: string;
    marker: Record<'add' | 'del' | 'ctx', string>;
    wordBg: { add: string; del: string };
    hunkBg: string;
    hunkText: string;
    sectionText: string;
    syntax: Record<SpanKind, string>;
    divider: string;
    textSecondary: string;
    text: string;
}

export function useDiffPalette(): DiffPalette {
    const { theme } = useUnistyles();
    return React.useMemo<DiffPalette>(() => {
        // Keep the resolver tolerant of the small legacy theme doubles used by
        // renderer tests while the application itself reads the nested tokens.
        const colors = theme.colors as unknown as {
            surface: string | { base: string };
            text: string | { primary: string; secondary: string; tertiary?: string };
            border?: { default?: string };
            divider?: string;
            textSecondary?: string;
            diff: {
                added?: { background: string; foreground: string };
                removed?: { background: string; foreground: string };
                context?: { background: string; foreground: string };
                lineNumber?: { foreground: string };
                hunk?: { background: string; foreground: string };
                inlineAdded?: { background: string };
                inlineRemoved?: { background: string };
                rowAddedBg?: string;
                rowRemovedBg?: string;
                rowContextBg?: string;
                gutterAddedBg?: string;
                gutterRemovedBg?: string;
                gutterContextBg?: string;
                gutterBorder?: string;
                lineNumberText?: string;
                markerAdded?: string;
                markerRemoved?: string;
                wordAddedBg?: string;
                wordRemovedBg?: string;
                hunkHeaderBg?: string;
                hunkHeaderText?: string;
                sectionText?: string;
                syntax: Record<SpanKind, string>;
            };
        };
        const d = colors.diff;
        const text = typeof colors.text === 'string'
            ? { primary: colors.text, secondary: colors.textSecondary ?? colors.text, tertiary: colors.textSecondary ?? colors.text }
            : {
                ...colors.text,
                tertiary: colors.text.tertiary ?? colors.text.secondary,
            };
        const surface = typeof colors.surface === 'string' ? colors.surface : colors.surface.base;
        const border = colors.border?.default ?? colors.divider ?? '#00000000';
        const added = d.added ?? { background: d.rowAddedBg ?? 'transparent', foreground: d.markerAdded ?? text.primary };
        const removed = d.removed ?? { background: d.rowRemovedBg ?? 'transparent', foreground: d.markerRemoved ?? text.primary };
        const context = d.context ?? { background: d.rowContextBg ?? 'transparent', foreground: text.secondary };
        const lineNumber = d.lineNumber?.foreground ?? d.lineNumberText ?? text.secondary;
        const hunk = d.hunk ?? { background: d.hunkHeaderBg ?? 'transparent', foreground: d.hunkHeaderText ?? text.secondary };
        return {
            surface,
            rowBg: { add: added.background, del: removed.background, ctx: context.background },
            gutterBg: {
                add: d.gutterAddedBg ?? added.background,
                del: d.gutterRemovedBg ?? removed.background,
                ctx: d.gutterContextBg ?? context.background,
            },
            gutterBorder: d.gutterBorder ?? border,
            lineNumber,
            marker: { add: added.foreground, del: removed.foreground, ctx: lineNumber },
            wordBg: {
                add: d.inlineAdded?.background ?? d.wordAddedBg ?? added.background,
                del: d.inlineRemoved?.background ?? d.wordRemovedBg ?? removed.background,
            },
            hunkBg: hunk.background,
            hunkText: hunk.foreground,
            sectionText: d.sectionText ?? text.tertiary,
            syntax: d.syntax,
            divider: border,
            textSecondary: text.secondary,
            text: text.primary,
        };
    }, [theme]);
}

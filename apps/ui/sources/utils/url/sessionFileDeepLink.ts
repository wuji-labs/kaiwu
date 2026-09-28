import type { ReviewCommentAnchor, ReviewCommentSource } from '@/sync/domains/input/reviewComments/reviewCommentTypes';
import { isLineContentHash } from '@/utils/text/lineContentHash';

type ExpoLocalSearchParams = Record<string, string | string[] | undefined>;

function firstString(value: string | string[] | undefined): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    return null;
}

function parseOptionalInt(value: string | null): number | null {
    if (!value) return null;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
}

function parseOptionalSide(value: string | null): 'before' | 'after' | undefined {
    if (value === 'before' || value === 'after') return value;
    return undefined;
}

function appendLineHash(parts: string[], key: string, value: string | undefined): void {
    if (!value) return;
    parts.push(`${key}=${encodeURIComponent(value)}`);
}

export function buildSessionFileDeepLink(params: {
    sessionId: string;
    filePath: string;
    source?: ReviewCommentSource;
    anchor?: ReviewCommentAnchor;
}): string {
    const base = `/session/${params.sessionId}/file?path=${encodeURIComponent(params.filePath)}`;
    if (!params.anchor || !params.source) return base;

    const anchor = params.anchor;
    const parts: string[] = [
        `source=${encodeURIComponent(params.source)}`,
        `anchor=${encodeURIComponent(anchor.kind)}`,
    ];

    if (anchor.kind === 'fileLine') {
        parts.push(`startLine=${encodeURIComponent(String(anchor.startLine))}`);
        appendLineHash(parts, 'lineHash', anchor.lineHash);
    } else if (anchor.kind === 'diffLine') {
        parts.push(
            `startLine=${encodeURIComponent(String(anchor.startLine))}`,
            `side=${encodeURIComponent(anchor.side)}`,
        );
        if (typeof anchor.oldLine === 'number') parts.push(`oldLine=${encodeURIComponent(String(anchor.oldLine))}`);
        if (typeof anchor.newLine === 'number') parts.push(`newLine=${encodeURIComponent(String(anchor.newLine))}`);
        appendLineHash(parts, 'lineHash', anchor.lineHash);
    } else if (anchor.kind === 'line') {
        parts.push(`line=${encodeURIComponent(String(anchor.line))}`);
        if (anchor.side) parts.push(`side=${encodeURIComponent(anchor.side)}`);
        appendLineHash(parts, 'lineHash', anchor.lineHash);
    } else if (anchor.kind === 'range') {
        parts.push(
            `startLine=${encodeURIComponent(String(anchor.startLine))}`,
            `endLine=${encodeURIComponent(String(anchor.endLine))}`,
        );
        if (anchor.side) parts.push(`side=${encodeURIComponent(anchor.side)}`);
        appendLineHash(parts, 'startLineHash', anchor.startLineHash);
        appendLineHash(parts, 'endLineHash', anchor.endLineHash);
        appendLineHash(parts, 'selectedTextHash', anchor.selectedTextHash);
    }

    return `${base}&${parts.join('&')}`;
}

export type SessionFileDeepLinkRouter = {
    push: (href: string) => void;
};

export function pushSessionFileDeepLink(
    router: SessionFileDeepLinkRouter,
    params: {
        sessionId: string;
        filePath: string;
        source?: ReviewCommentSource;
        anchor?: ReviewCommentAnchor;
    },
): void {
    const href = buildSessionFileDeepLink(params);
    router.push(href);
}

export function parseSessionFileDeepLinkAnchor(params: ExpoLocalSearchParams): {
    source: ReviewCommentSource;
    anchor: ReviewCommentAnchor;
} | null {
    const sourceRaw = firstString(params.source);
    const anchorKind = firstString(params.anchor);
    const startLine = parseOptionalInt(firstString(params.startLine));
    if (!sourceRaw || (sourceRaw !== 'file' && sourceRaw !== 'diff')) return null;
    if (!anchorKind) return null;

    const source: ReviewCommentSource = sourceRaw;
    const lineHashRaw = firstString(params.lineHash);
    const lineHash = isLineContentHash(lineHashRaw) ? lineHashRaw : undefined;

    if (anchorKind === 'fileLine') {
        if (!startLine || startLine <= 0) return null;
        return { source, anchor: { kind: 'fileLine', startLine, lineHash } };
    }

    if (anchorKind === 'diffLine') {
        if (!startLine || startLine <= 0) return null;
        const sideRaw = parseOptionalSide(firstString(params.side));
        if (!sideRaw) return null;
        const oldLine = parseOptionalInt(firstString(params.oldLine));
        const newLine = parseOptionalInt(firstString(params.newLine));
        return {
            source,
            anchor: {
                kind: 'diffLine',
                startLine,
                side: sideRaw,
                oldLine,
                newLine,
                lineHash,
            },
        };
    }

    if (anchorKind === 'line') {
        const line = parseOptionalInt(firstString(params.line)) ?? startLine;
        if (!line || line <= 0) return null;
        return {
            source,
            anchor: {
                kind: 'line',
                filePath: '',
                line,
                side: parseOptionalSide(firstString(params.side)),
                lineHash,
            },
        };
    }

    if (anchorKind === 'range') {
        if (!startLine || startLine <= 0) return null;
        const endLine = parseOptionalInt(firstString(params.endLine));
        if (!endLine || endLine < startLine) return null;
        const startLineHashRaw = firstString(params.startLineHash);
        const endLineHashRaw = firstString(params.endLineHash);
        const selectedTextHashRaw = firstString(params.selectedTextHash);
        const startLineHash = isLineContentHash(startLineHashRaw) ? startLineHashRaw : undefined;
        const endLineHash = isLineContentHash(endLineHashRaw) ? endLineHashRaw : undefined;
        const selectedTextHash = isLineContentHash(selectedTextHashRaw) ? selectedTextHashRaw : undefined;
        return {
            source,
            anchor: {
                kind: 'range',
                filePath: '',
                startLine,
                endLine,
                side: parseOptionalSide(firstString(params.side)),
                startLineHash,
                endLineHash,
                selectedTextHash,
            },
        };
    }

    return null;
}

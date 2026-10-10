import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '@/dev/testkit';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./happier/HappierUnifiedDiffViewer', () => ({
    HappierUnifiedDiffViewer: (props: any) => React.createElement('HappierUnifiedDiffViewer', { ...props, testID: 'happier-unified-diff-viewer' }),
}));

vi.mock('./happier/HappierTextDiffViewer', () => ({
    HappierTextDiffViewer: (props: any) => React.createElement('HappierTextDiffViewer', { ...props, testID: 'happier-text-diff-viewer' }),
}));

describe('DiffViewer (web renderer selection)', () => {
    it('uses the Happier unified renderer and forwards unified diff interactions', async () => {
        const { DiffViewer } = await import('./DiffViewer.web');
        const onPressLine = vi.fn();
        const onPressLineRange = vi.fn();

        const screen = await renderScreen(
            <DiffViewer
                mode="unified"
                unifiedDiff={'diff --git a/a.ts b/a.ts'}
                filePath="a.ts"
                virtualized={true}
                onPressLine={onPressLine}
                onPressLineRange={onPressLineRange}
            />,
        );

        const viewer = screen.findByTestId('happier-unified-diff-viewer');
        expect(viewer).toBeTruthy();
        expect(screen.findByTestId('happier-text-diff-viewer')).toBeNull();
        expect(viewer?.props.unifiedDiff).toBe('diff --git a/a.ts b/a.ts');
        expect(viewer?.props.virtualized).toBe(true);
        expect(viewer?.props.onPressLine).toBe(onPressLine);
        expect(viewer?.props.onPressLineRange).toBe(onPressLineRange);
    });

    it('uses the Happier text renderer and forwards text diff props', async () => {
        const { DiffViewer } = await import('./DiffViewer.web');
        const onPressLine = vi.fn();

        const screen = await renderScreen(
            <DiffViewer
                mode="text"
                oldText="before"
                newText="after"
                filePath="a.ts"
                contextLines={4}
                onPressLine={onPressLine}
            />,
        );

        const viewer = screen.findByTestId('happier-text-diff-viewer');
        expect(viewer).toBeTruthy();
        expect(screen.findByTestId('happier-unified-diff-viewer')).toBeNull();
        expect(viewer?.props.oldText).toBe('before');
        expect(viewer?.props.newText).toBe('after');
        expect(viewer?.props.contextLines).toBe(4);
        expect(viewer?.props.onPressLine).toBe(onPressLine);
    });
});

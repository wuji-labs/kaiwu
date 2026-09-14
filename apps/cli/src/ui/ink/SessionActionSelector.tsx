import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { compactHomePath } from '@/ui/format/styles';
import { formatSessionUpdatedAtForCli, shortenSessionIdForCli } from '@/ui/sessionListFormatting';
import { resolveSessionSelectorColumnLayout, truncateEnd, truncateMiddle } from '@/ui/sessionTableLayout';

export type SessionActionSelectorRow = Readonly<{
  sessionId: string;
  agentId: string;
  updatedAt: number;
  title: string;
  path: string;
  annotation?: string | null;
  probeable?: boolean;
  disabled?: boolean;
  disabledReason?: string | null;
}>;

export const SESSION_ACTION_SELECTOR_HEADER_TITLE = '标题';
export const SESSION_ACTION_SELECTOR_HEADER_AGENT = '智能体';
export const SESSION_ACTION_SELECTOR_HEADER_UPDATED = '更新时间';
export const SESSION_ACTION_SELECTOR_HEADER_ID = 'ID';
export const SESSION_ACTION_SELECTOR_HEADER_PATH = '路径';
export const SESSION_ACTION_SELECTOR_UNTITLED = '(未命名)';

export function findNextSessionActionSelectorIndex(
  rows: ReadonlyArray<SessionActionSelectorRow>,
  start: number,
  direction: 1 | -1,
): number {
  if (rows.length === 0) return 0;
  const normalizedStart = Number.isInteger(start)
    ? Math.max(0, Math.min(rows.length - 1, start))
    : 0;
  return (normalizedStart + direction + rows.length) % rows.length;
}

function resolveInitialSelectedIndex(rows: ReadonlyArray<SessionActionSelectorRow>): number {
  const firstEnabled = rows.findIndex((row) => !row.disabled);
  return firstEnabled === -1 ? 0 : firstEnabled;
}

export function resolveSessionActionSelectorDisabledGroupLabel(actionVerb: string): string {
  const verb = actionVerb.trim().toLowerCase();
  if (verb === 'attach' || verb === '接入') return '无法接入';
  if (verb === 'resume' || verb === '恢复') return '无法恢复';
  return `无法${actionVerb || '选择'}`;
}

export function resolveSessionActionSelectorViewport(params: Readonly<{
  rowCount: number;
  selectedIndex: number;
  terminalRows: number | null | undefined;
}>): Readonly<{ startIndex: number; endIndex: number; visibleCount: number }> {
  const rowCount = Math.max(0, Math.trunc(params.rowCount));
  if (rowCount === 0) return { startIndex: 0, endIndex: 0, visibleCount: 0 };

  const terminalRows = typeof params.terminalRows === 'number' && Number.isFinite(params.terminalRows)
    ? Math.trunc(params.terminalRows)
    : 24;
  const maxVisibleRows = Math.min(rowCount, Math.max(8, terminalRows - 8));
  const selectedIndex = Number.isInteger(params.selectedIndex)
    ? Math.max(0, Math.min(rowCount - 1, params.selectedIndex))
    : 0;

  const latestStartForSelected = Math.max(0, selectedIndex - maxVisibleRows + 1);
  const maxStart = Math.max(0, rowCount - maxVisibleRows);
  const startIndex = Math.min(latestStartForSelected, maxStart);
  const endIndex = Math.min(rowCount, startIndex + maxVisibleRows);
  return { startIndex, endIndex, visibleCount: endIndex - startIndex };
}

export function resolveSessionActionSelectorIndicator(params: Readonly<{
  disabled?: boolean;
  isSelected: boolean;
}>): string {
  return params.isSelected ? '› ' : '  ';
}

export function resolveSessionActionSelectorEnterResult(
  row: SessionActionSelectorRow | null | undefined,
  actionVerb: string,
): Readonly<{ type: 'selected'; sessionId: string } | { type: 'blocked'; message: string } | { type: 'none' }> {
  if (!row) return { type: 'none' };
  if (!row.disabled) return { type: 'selected', sessionId: row.sessionId };

  const reason = row.disabledReason?.trim() || row.annotation?.trim();
  const verb = actionVerb.trim().toLowerCase();
  const localizedVerb = (verb === 'attach' || verb === '接入') ? '接入' : (verb === 'resume' || verb === '恢复') ? '恢复' : (actionVerb.trim() || '选择');
  return {
    type: 'blocked',
    message: reason || `该会话无法${localizedVerb}。`,
  };
}

/**
 * Render the table header — column labels in dim text. Skipped when the
 * terminal is too narrow for the column layout to be readable.
 */
function HeaderRow(props: Readonly<{
  layout: ReturnType<typeof resolveSessionSelectorColumnLayout>;
}>): React.ReactElement | null {
  const { layout } = props;
  if (!layout) return null;
  return (
    <Box>
      <Box width={layout.indicatorWidth} flexShrink={0}>
        <Text>  </Text>
      </Box>
      <Box width={layout.titleWidth} flexShrink={0}>
        <Text dimColor>{SESSION_ACTION_SELECTOR_HEADER_TITLE}</Text>
      </Box>
      <Box width={layout.separatorWidth} flexShrink={0}><Text> </Text></Box>
      <Box width={layout.agentWidth} flexShrink={0}>
        <Text dimColor>{SESSION_ACTION_SELECTOR_HEADER_AGENT}</Text>
      </Box>
      <Box width={layout.separatorWidth} flexShrink={0}><Text> </Text></Box>
      <Box width={layout.updatedWidth} flexShrink={0}>
        <Text dimColor>{SESSION_ACTION_SELECTOR_HEADER_UPDATED}</Text>
      </Box>
      <Box width={layout.separatorWidth} flexShrink={0}><Text> </Text></Box>
      <Box width={layout.idWidth} flexShrink={0}>
        <Text dimColor>{SESSION_ACTION_SELECTOR_HEADER_ID}</Text>
      </Box>
      <Box width={layout.separatorWidth} flexShrink={0}><Text> </Text></Box>
      <Box width={layout.pathWidth} flexShrink={0}>
        <Text dimColor>{SESSION_ACTION_SELECTOR_HEADER_PATH}</Text>
      </Box>
    </Box>
  );
}

/**
 * Render a single row in the columnar layout. Each cell is its own Box with
 * a fixed width so Ink can't word-wrap long strings into the next column.
 */
function SelectorRow(props: Readonly<{
  row: SessionActionSelectorRow;
  isSelected: boolean;
  layout: ReturnType<typeof resolveSessionSelectorColumnLayout>;
  nowMs: number;
}>): React.ReactElement {
  const { row, isSelected, layout, nowMs } = props;
  const title = row.title?.trim() ? row.title.trim() : SESSION_ACTION_SELECTOR_UNTITLED;
  const updated = formatSessionUpdatedAtForCli(row.updatedAt, nowMs);
  const id = shortenSessionIdForCli(row.sessionId);
  const compactPath = compactHomePath(row.path) || row.path;

  // Single-column fallback when the terminal is too narrow for the table.
  // We still preserve the ›/dim styling so navigation feels right.
  if (!layout) {
    const tone = isSelected && row.disabled ? 'yellow' : isSelected ? 'cyan' : row.disabled ? 'gray' : undefined;
    return (
      <Box>
        <Text color={tone} dimColor={row.disabled}>
          {resolveSessionActionSelectorIndicator({ isSelected, disabled: row.disabled })}
          {title}
        </Text>
      </Box>
    );
  }

  const tone = isSelected && row.disabled ? 'yellow' : isSelected ? 'cyan' : row.disabled ? 'gray' : undefined;
  return (
    <Box>
      <Box width={layout.indicatorWidth} flexShrink={0}>
        <Text color={tone}>{resolveSessionActionSelectorIndicator({ isSelected, disabled: row.disabled })}</Text>
      </Box>
      <Box width={layout.titleWidth} flexShrink={0}>
        <Text color={tone} dimColor={row.disabled} bold={isSelected && !row.disabled}>
          {truncateEnd(title, layout.titleWidth)}
        </Text>
      </Box>
      <Box width={layout.separatorWidth} flexShrink={0}><Text> </Text></Box>
      <Box width={layout.agentWidth} flexShrink={0}>
        <Text color={tone} dimColor={row.disabled}>{truncateEnd(row.agentId, layout.agentWidth)}</Text>
      </Box>
      <Box width={layout.separatorWidth} flexShrink={0}><Text> </Text></Box>
      <Box width={layout.updatedWidth} flexShrink={0}>
        <Text color={tone} dimColor={row.disabled}>{truncateEnd(updated, layout.updatedWidth)}</Text>
      </Box>
      <Box width={layout.separatorWidth} flexShrink={0}><Text> </Text></Box>
      <Box width={layout.idWidth} flexShrink={0}>
        <Text color={tone} dimColor={row.disabled}>{truncateEnd(id, layout.idWidth)}</Text>
      </Box>
      <Box width={layout.separatorWidth} flexShrink={0}><Text> </Text></Box>
      <Box width={layout.pathWidth} flexShrink={0}>
        <Text color={tone} dimColor={row.disabled}>{truncateMiddle(compactPath, layout.pathWidth)}</Text>
      </Box>
    </Box>
  );
}

/**
 * One-line muted reason rendered below the row when annotation is set
 * (typically the explainer's `shortReason` for disabled rows). Indented to
 * sit under the row's title column.
 */
function RowAnnotation(props: Readonly<{
  annotation: string;
  isSelected?: boolean;
  layout: ReturnType<typeof resolveSessionSelectorColumnLayout>;
}>): React.ReactElement {
  const { annotation, isSelected, layout } = props;
  const indentWidth = layout?.indicatorWidth ?? 2;
  return (
    <Box>
      <Box width={indentWidth} flexShrink={0}><Text> </Text></Box>
      <Text color={isSelected ? 'yellow' : 'gray'}>↳ {annotation}</Text>
    </Box>
  );
}

/**
 * Visual divider between the attachable group and the disabled group.
 * Quiet but unambiguous — this is exactly the moment the user might think
 * "wait, why is this one greyed out?".
 */
function GroupDivider(props: Readonly<{ label: string }>): React.ReactElement {
  return (
    <Box marginTop={1} marginBottom={0}>
      <Text dimColor>── {props.label} ──────────────────────────────────────────</Text>
    </Box>
  );
}

export function SessionActionSelector(props: Readonly<{
  title: string;
  actionVerb: string;
  footerHint?: string | null;
  rows: ReadonlyArray<SessionActionSelectorRow>;
  onSelect: (sessionId: string) => void;
  onCancel: () => void;
  onProbe?: (sessionId: string) => Promise<{ reachable: boolean; reason?: string }>;
}>): React.ReactElement {
  const initialRows = useMemo(() => props.rows.slice(0, 200), [props.rows]);
  const [rows, setRows] = useState<ReadonlyArray<SessionActionSelectorRow>>(initialRows);
  const [selectedIndex, setSelectedIndex] = useState<number>(() => resolveInitialSelectedIndex(initialRows));
  const [blockedSelectionMessage, setBlockedSelectionMessage] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
    setSelectedIndex(resolveInitialSelectedIndex(initialRows));
    setBlockedSelectionMessage(null);
  }, [initialRows]);

  useInput((input, key) => {
    if (rows.length === 0) return;
    if (key.upArrow) {
      setBlockedSelectionMessage(null);
      setSelectedIndex((prev) => findNextSessionActionSelectorIndex(rows, prev, -1));
      return;
    }
    if (key.downArrow) {
      setBlockedSelectionMessage(null);
      setSelectedIndex((prev) => findNextSessionActionSelectorIndex(rows, prev, 1));
      return;
    }
    if (key.return) {
      const result = resolveSessionActionSelectorEnterResult(rows[selectedIndex], props.actionVerb);
      if (result.type === 'selected') {
        props.onSelect(result.sessionId);
        return;
      }
      if (result.type === 'blocked') {
        setBlockedSelectionMessage(result.message);
      }
      return;
    }
    if ((input === 'p' || input === 'P') && props.onProbe) {
      const selected = rows[selectedIndex];
      if (!selected?.probeable) return;

      setRows((currentRows) => currentRows.map((row, index) => index === selectedIndex
        ? {
            ...row,
            annotation: '正在检查远程',
            disabled: true,
            disabledReason: '正在检查远程连通性…',
          }
        : row));

      void props.onProbe(selected.sessionId).then((result) => {
        setRows((currentRows) => currentRows.map((row) => {
          if (row.sessionId !== selected.sessionId) return row;
          if (result.reachable) {
            return {
              ...row,
              annotation: '远程可用',
              disabled: false,
              disabledReason: null,
            };
          }
          return {
            ...row,
            annotation: '远程不可达',
            disabled: true,
            disabledReason: result.reason ?? '远程会话不可达。',
          };
        }));
      });
      return;
    }
    if (key.escape || (key.ctrl && input === 'c')) {
      props.onCancel();
    }
  });

  const nowMs = Date.now();
  const termWidth = process.stdout.columns ?? 120;
  const termRows = process.stdout.rows ?? null;
  const layout = resolveSessionSelectorColumnLayout(termWidth);
  const viewport = resolveSessionActionSelectorViewport({
    rowCount: rows.length,
    selectedIndex,
    terminalRows: termRows,
  });
  const visibleRows = rows.slice(viewport.startIndex, viewport.endIndex);

  // Find the index of the first disabled row so we can drop a divider there.
  const firstDisabledIndex = rows.findIndex((row) => row.disabled);
  const selectedRow = rows[selectedIndex] ?? null;
  const selectedRowFullReason =
    selectedRow?.disabled && selectedRow?.disabledReason ? selectedRow.disabledReason : null;
  const disabledGroupLabel = resolveSessionActionSelectorDisabledGroupLabel(props.actionVerb);
  const normalizedVerb = props.actionVerb.trim().toLowerCase();
  const actionVerbLabel = normalizedVerb === 'attach' || normalizedVerb === '接入'
    ? '接入'
    : normalizedVerb === 'resume' || normalizedVerb === '恢复'
      ? '恢复'
      : props.actionVerb;

  return (
    <Box flexDirection="column" paddingY={1}>
      <Box marginBottom={1}>
        <Text bold>{props.title}</Text>
      </Box>

      {rows.length > 0 && layout ? <HeaderRow layout={layout} /> : null}

      <Box flexDirection="column">
        {visibleRows.map((row, visibleIndex) => {
          const index = viewport.startIndex + visibleIndex;
          const isSelected = index === selectedIndex;
          const showDivider = index === firstDisabledIndex && index > 0;
          const annotation = row.annotation?.trim() ? row.annotation.trim() : null;

          return (
            <React.Fragment key={row.sessionId}>
              {showDivider ? <GroupDivider label={disabledGroupLabel} /> : null}
              <SelectorRow row={row} isSelected={isSelected} layout={layout} nowMs={nowMs} />
              {annotation ? <RowAnnotation annotation={annotation} isSelected={isSelected} layout={layout} /> : null}
            </React.Fragment>
          );
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          使用 ↑/↓ 选择，按 Enter {actionVerbLabel}，按 Esc 取消
        </Text>
        {viewport.visibleCount < rows.length ? (
          <Text dimColor>
            显示第 {viewport.startIndex + 1}-{viewport.endIndex} 项，共 {rows.length} 项
          </Text>
        ) : null}
        {props.onProbe ? <Text dimColor>按 P 检查远程连通性</Text> : null}
        {blockedSelectionMessage ? (
          <Text color="yellow">无法{actionVerbLabel}: {blockedSelectionMessage}</Text>
        ) : null}
        {selectedRowFullReason ? <Text dimColor>{selectedRowFullReason}</Text> : null}
        {props.footerHint ? <Text dimColor>{props.footerHint}</Text> : null}
      </Box>
    </Box>
  );
}

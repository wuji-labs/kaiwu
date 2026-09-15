import { describe, expect, it } from 'vitest';

import {
  resolveActionApprovalRouting as resolveActionApprovalRoutingFromRoot,
  type ActionApprovalRoutingDecision as RootActionApprovalRoutingDecision,
} from '../index.js';
import type { ActionsSettingsV1 } from './actionSettings.js';
import {
  isApprovalRequiredByActionsSettings,
  resolveActionApprovalRouting,
  type ActionApprovalRoutingDecision,
} from './actionApprovalPolicy.js';
import {
  resolveActionApprovalRouting as resolveActionApprovalRoutingFromActions,
  type ResolveActionApprovalRoutingArgs,
} from './index.js';
import { getActionSpec } from './actionSpecs.js';

describe('isApprovalRequiredByActionsSettings', () => {
  it('returns true when the action override requires approvals for the given surface', () => {
    const settings: ActionsSettingsV1 = {
      v: 1,
      actions: {
        'review.start': {
          enabledPlacements: [],
          disabledSurfaces: [],
          disabledPlacements: [],
          approvalRequiredSurfaces: ['cli'],
        },
      } as any,
    };

    expect(isApprovalRequiredByActionsSettings('review.start' as any, settings, { surface: 'cli' } as any)).toBe(true);
    expect(isApprovalRequiredByActionsSettings('review.start' as any, settings, { surface: 'mcp' } as any)).toBe(false);
  });

  it('allows requiring approvals for session.title.set when configured', () => {
    const settings: ActionsSettingsV1 = {
      v: 1,
      actions: {
        'session.title.set': {
          enabledPlacements: [],
          disabledSurfaces: [],
          disabledPlacements: [],
          approvalRequiredSurfaces: ['cli', 'mcp'],
        },
      } as any,
    };

    expect(isApprovalRequiredByActionsSettings('session.title.set' as any, settings, { surface: 'cli' } as any)).toBe(true);
    expect(isApprovalRequiredByActionsSettings('session.title.set' as any, settings, { surface: 'mcp' } as any)).toBe(true);
  });

  it('requires approvals for reset-credit consume without requiring usage-limit check-now', () => {
    const settings: ActionsSettingsV1 = {
      v: 1,
      actions: {
        'session.usageLimit.consumeResetCredit': {
          enabledPlacements: [],
          disabledSurfaces: [],
          disabledPlacements: [],
          approvalRequiredSurfaces: ['cli'],
        },
      } as any,
    };

    expect(isApprovalRequiredByActionsSettings('session.usageLimit.checkNow' as any, settings, { surface: 'cli' } as any)).toBe(false);
    expect(isApprovalRequiredByActionsSettings('session.usageLimit.consumeResetCredit' as any, settings, { surface: 'cli' } as any)).toBe(true);
  });

  it('returns a non-required typed route when settings do not require the active surface', () => {
    const settings: ActionsSettingsV1 = {
      v: 1,
      actions: {
        'session.list': {
          enabledPlacements: [],
          disabledSurfaces: [],
          disabledPlacements: [],
          approvalRequiredSurfaces: ['cli'],
        },
      } as any,
    };

    expect(resolveActionApprovalRouting({
      actionId: 'session.list' as any,
      spec: getActionSpec('session.list'),
      settings,
      context: { surface: 'mcp' } as any,
    })).toEqual({ required: false, flow: 'blocking', result: 'required' });
  });

  it('routes result-required approvals as blocking when required by policy', () => {
    const settings: ActionsSettingsV1 = {
      v: 1,
      actions: {
        'session.list': {
          enabledPlacements: [],
          disabledSurfaces: [],
          disabledPlacements: [],
          approvalRequiredSurfaces: ['mcp'],
        },
      } as any,
    };

    expect(resolveActionApprovalRouting({
      actionId: 'session.list' as any,
      spec: getActionSpec('session.list'),
      settings,
      context: { surface: 'mcp' } as any,
    })).toEqual({ required: true, flow: 'blocking', result: 'required' });
  });

  it('routes no-result approvals as deferred when required by policy', () => {
    expect(resolveActionApprovalRouting({
      actionId: 'session.title.set' as any,
      spec: getActionSpec('session.title.set'),
      context: { surface: 'mcp' } as any,
      requiredByPolicy: true,
    })).toEqual({ required: true, flow: 'deferred', result: 'none' });
  });

  it('uses explicit flow for optional-result approvals', () => {
    expect(resolveActionApprovalRouting({
      actionId: 'review.start' as any,
      spec: getActionSpec('review.start'),
      context: { surface: 'cli' } as any,
      requiredByPolicy: true,
    })).toEqual({ required: true, flow: 'deferred', result: 'optional' });
  });

  it('never requires approval actions to route into approval', () => {
    expect(resolveActionApprovalRouting({
      actionId: 'approval.request.decide' as any,
      spec: getActionSpec('approval.request.decide'),
      context: { surface: 'mcp' } as any,
      requiredByPolicy: true,
    })).toEqual({ required: false, flow: 'deferred', result: 'none' });
  });

  it('bypasses approval routing when caller is in full-access yolo mode', () => {
    expect(resolveActionApprovalRouting({
      actionId: 'session.list' as any,
      spec: getActionSpec('session.list'),
      context: { surface: 'mcp', callerPermissionMode: 'yolo' } as any,
      requiredByPolicy: true,
    })).toEqual({ required: false, flow: 'blocking', result: 'required' });

    expect(resolveActionApprovalRouting({
      actionId: 'session.title.set' as any,
      spec: getActionSpec('session.title.set'),
      context: { surface: 'session_agent', callerPermissionMode: 'bypassPermissions' } as any,
      requiredByPolicy: true,
    })).toEqual({ required: false, flow: 'deferred', result: 'none' });
  });

  it('exports approval routing through action and protocol barrels', () => {
    const args: ResolveActionApprovalRoutingArgs = {
      actionId: 'session.list' as any,
      spec: getActionSpec('session.list'),
      context: { surface: 'mcp' } as any,
      requiredByPolicy: true,
    };

    const actionsDecision: ActionApprovalRoutingDecision = resolveActionApprovalRoutingFromActions(args);
    const rootDecision: RootActionApprovalRoutingDecision = resolveActionApprovalRoutingFromRoot(args);

    expect(actionsDecision).toEqual({ required: true, flow: 'blocking', result: 'required' });
    expect(rootDecision).toEqual(actionsDecision);
  });
});

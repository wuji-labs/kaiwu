import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { CapabilitiesSchema } from './capabilitiesSchema.js';

describe('CapabilitiesSchema (server capabilities)', () => {
  it('parses independent Runtime Activity and Pending-input session capabilities', () => {
    const parsed = CapabilitiesSchema.parse({
      session: {
        runtimeActivity: { protocolVersion: 2 },
        pendingInput: {
          protocolVersion: 2,
        },
      },
    });

    expect(parsed.session.runtimeActivity).toEqual({ protocolVersion: 2 });
    expect(parsed.session.pendingInput).toEqual({ protocolVersion: 2 });
    expect(CapabilitiesSchema.safeParse({
      server: {
        runtimeActivity: { protocolVersion: 2 },
      },
    }).success).toBe(false);
  });

  it('parses server identity capabilities outside the strict server capability object', () => {
    const parsed = CapabilitiesSchema.parse({
      server: {
        canonicalServerUrl: 'https://stack.example.test',
      },
      serverIdentity: {
        serverIdentityId: 'srv_identity_123',
      },
    });

    expect(parsed.server.canonicalServerUrl).toBe('https://stack.example.test');
    expect(parsed.serverIdentity.serverIdentityId).toBe('srv_identity_123');
  });

  it('defaults missing server identity capabilities for older servers', () => {
    const parsed = CapabilitiesSchema.parse({});

    expect(parsed.serverIdentity.serverIdentityId).toBeNull();
  });

  it('normalizes unsafe server identity capabilities to null', () => {
    const parsed = CapabilitiesSchema.parse({
      serverIdentity: {
        serverIdentityId: 'relay.example.test',
      },
    });

    expect(parsed.serverIdentity.serverIdentityId).toBeNull();
  });

  it('keeps new server identity payloads parseable for old strict server capability shapes', () => {
    const OldCapabilitiesSchema = z.object({
      server: z.object({
        canonicalServerUrl: z.string().trim().min(1).optional(),
        webappUrl: z.string().trim().min(1).optional(),
      }).strict().optional().default({}),
    });

    const parsed = OldCapabilitiesSchema.parse({
      server: {
        canonicalServerUrl: 'https://stack.example.test',
      },
      serverIdentity: {
        serverIdentityId: 'srv_identity_123',
      },
    });

    expect(parsed).toEqual({
      server: {
        canonicalServerUrl: 'https://stack.example.test',
      },
    });
  });

  it('preserves server url capabilities when provided', () => {
    const parsed = CapabilitiesSchema.parse({
      server: {
        canonicalServerUrl: 'https://stack.example.test',
        webappUrl: 'https://app.example.test',
      },
    });

    expect(parsed).toMatchObject({
      server: {
        canonicalServerUrl: 'https://stack.example.test',
        webappUrl: 'https://app.example.test',
      },
    });
  });

  it('parses server retention capabilities when provided', () => {
    const parsed = CapabilitiesSchema.parse({
      server: {
        retention: {
          policyVersion: 1,
          enabled: true,
          sessions: {
            mode: 'delete_inactive',
            inactivityDays: 30,
            requires: ['updatedAt', 'lastActiveAt'],
          },
          sessionMessages: { mode: 'delete_older_than', days: 30 },
          accountChanges: { mode: 'delete_older_than', days: 30 },
          voiceSessionLeases: { mode: 'keep_forever' },
          userFeedItems: { mode: 'delete_older_than', days: 90 },
          sessionShareAccessLogs: { mode: 'delete_older_than', days: 30 },
          publicShareAccessLogs: { mode: 'delete_older_than', days: 30 },
          terminalAuthRequests: { mode: 'delete_older_than', days: 7 },
          accountAuthRequests: { mode: 'delete_older_than', days: 7 },
          authPairingSessions: { mode: 'delete_older_than', days: 7 },
          repeatKeys: { mode: 'delete_older_than', days: 7 },
          globalLocks: { mode: 'delete_older_than', days: 7 },
          automationRuns: { mode: 'delete_older_than', days: 30 },
          automationRunEvents: { mode: 'delete_older_than', days: 30 },
        },
      },
    });

    expect(parsed.server.retention).toMatchObject({
      policyVersion: 1,
      enabled: true,
      sessions: {
        mode: 'delete_inactive',
        inactivityDays: 30,
        requires: ['updatedAt', 'lastActiveAt'],
      },
      sessionMessages: { mode: 'delete_older_than', days: 30 },
      accountChanges: { mode: 'delete_older_than', days: 30 },
      voiceSessionLeases: { mode: 'keep_forever' },
    });
  });

  it('parses session message role capabilities when provided', () => {
    const parsed = CapabilitiesSchema.parse({
      session: {
        messages: {
          role: true,
        },
      },
    });

    expect(parsed.session.messages.role).toBe(true);
  });

  it('defaults session message role capabilities to unsupported', () => {
    const parsed = CapabilitiesSchema.parse({});

    expect(parsed.session.messages.role).toBe(false);
  });
});

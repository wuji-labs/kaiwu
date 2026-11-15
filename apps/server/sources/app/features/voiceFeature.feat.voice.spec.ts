import { describe, expect, it } from 'vitest';

import { resolveVoiceFeature } from './voiceFeature';

describe('features/voiceFeature', () => {
  it('keeps removed voice disabled while marking Happier Voice unavailable when ElevenLabs is not configured', () => {
    const res = resolveVoiceFeature({
      NODE_ENV: 'production',
      KAIWU_FEATURE_VOICE__ENABLED: 'true',
      KAIWU_FEATURE_VOICE__REQUIRE_SUBSCRIPTION: 'false',
      // Missing ELEVENLABS_* env vars
    } as any);

    expect(res.features?.voice?.enabled).toBe(false);
    expect((res.features as any)?.voice?.happierVoice?.enabled).toBe(false);
    expect(res.capabilities?.voice?.configured).toBe(false);
    expect(res.capabilities?.voice?.provider).toBe(null);
  });

  it('keeps the removed voice gate disabled when configured in non-production', () => {
    const res = resolveVoiceFeature({
      NODE_ENV: 'development',
      KAIWU_FEATURE_VOICE__ENABLED: 'true',
      KAIWU_FEATURE_VOICE__REQUIRE_SUBSCRIPTION: 'false',
      ELEVENLABS_API_KEY: 'k',
      ELEVENLABS_AGENT_ID: 'agent_dev',
    } as any);

    expect(res.capabilities?.voice?.configured).toBe(true);
    expect(res.features?.voice?.enabled).toBe(false);
    expect((res.features as any)?.voice?.happierVoice?.enabled).toBe(false);
    expect(res.capabilities?.voice?.provider).toBe('elevenlabs');
  });

  it('allows using ELEVENLABS_AGENT_ID_PROD as a fallback in non-production', () => {
    const res = resolveVoiceFeature({
      NODE_ENV: 'development',
      KAIWU_FEATURE_VOICE__ENABLED: 'true',
      KAIWU_FEATURE_VOICE__REQUIRE_SUBSCRIPTION: 'false',
      ELEVENLABS_API_KEY: 'k',
      ELEVENLABS_AGENT_ID_PROD: 'agent_prod',
    } as any);

    expect(res.capabilities?.voice?.configured).toBe(true);
    expect(res.features?.voice?.enabled).toBe(false);
    expect((res.features as any)?.voice?.happierVoice?.enabled).toBe(false);
  });

  it('prefers ELEVENLABS_AGENT_ID_PROD in production when set', () => {
    const res = resolveVoiceFeature({
      NODE_ENV: 'production',
      KAIWU_FEATURE_VOICE__ENABLED: 'true',
      KAIWU_FEATURE_VOICE__REQUIRE_SUBSCRIPTION: 'false',
      ELEVENLABS_API_KEY: 'k',
      ELEVENLABS_AGENT_ID: 'agent_dev',
      ELEVENLABS_AGENT_ID_PROD: 'agent_prod',
    } as any);

    expect(res.capabilities?.voice?.configured).toBe(true);
    expect(res.features?.voice?.enabled).toBe(false);
    expect((res.features as any)?.voice?.happierVoice?.enabled).toBe(false);
  });

  it('falls back to ELEVENLABS_AGENT_ID in production when prod override is missing', () => {
    const res = resolveVoiceFeature({
      NODE_ENV: 'production',
      KAIWU_FEATURE_VOICE__ENABLED: 'true',
      KAIWU_FEATURE_VOICE__REQUIRE_SUBSCRIPTION: 'false',
      ELEVENLABS_API_KEY: 'k',
      ELEVENLABS_AGENT_ID: 'agent_dev',
    } as any);

    expect(res.capabilities?.voice?.configured).toBe(true);
    expect(res.features?.voice?.enabled).toBe(false);
    expect((res.features as any)?.voice?.happierVoice?.enabled).toBe(false);
  });
});

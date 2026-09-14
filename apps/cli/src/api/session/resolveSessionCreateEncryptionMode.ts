import axios from 'axios';

import {
  AccountEncryptionModeResponseSchema,
} from '@happier-dev/protocol';

import { fetchServerFeaturesSnapshot } from '@/features/serverFeaturesClient';
import { assertSessionEncryptionModeAllowedByEffectiveClientRequirement } from '@/settings/accountSettings/resolveEffectiveClientEncryptionRequirement';

export type DesiredSessionCreateEncryptionModeResult = Readonly<{
  desiredSessionEncryptionMode: 'e2ee' | 'plain';
  serverSupportsFeatureSnapshot: boolean;
  storagePolicy: 'required_e2ee' | 'optional' | 'plaintext_only';
}>;

export async function resolveSessionCreateEncryptionMode(params: Readonly<{
  token: string;
  serverBaseUrl: string;
  featuresTimeoutMs?: number;
  accountTimeoutMs?: number;
}>): Promise<DesiredSessionCreateEncryptionModeResult> {
  const featuresTimeoutMs = typeof params.featuresTimeoutMs === 'number' && params.featuresTimeoutMs > 0 ? params.featuresTimeoutMs : 800;
  const accountTimeoutMs = typeof params.accountTimeoutMs === 'number' && params.accountTimeoutMs > 0 ? params.accountTimeoutMs : 10_000;

  const featuresSnapshot = await fetchServerFeaturesSnapshot({ serverUrl: params.serverBaseUrl, timeoutMs: featuresTimeoutMs });
  const serverSupportsFeatureSnapshot = featuresSnapshot.status === 'ready';
  const storagePolicy: 'required_e2ee' | 'optional' | 'plaintext_only' =
    featuresSnapshot.status === 'ready'
      ? featuresSnapshot.features.capabilities.encryption.storagePolicy
      : 'required_e2ee';

  if (storagePolicy === 'plaintext_only') {
    assertSessionEncryptionModeAllowedByEffectiveClientRequirement('plain');
    return { desiredSessionEncryptionMode: 'plain', serverSupportsFeatureSnapshot, storagePolicy };
  }
  if (storagePolicy !== 'optional') {
    return { desiredSessionEncryptionMode: 'e2ee', serverSupportsFeatureSnapshot, storagePolicy };
  }

  // storagePolicy === 'optional': follow the account's stored preference (fail-closed to e2ee).
  try {
    const response = await axios.get(`${params.serverBaseUrl.replace(/\/+$/, '')}/v1/account/encryption`, {
      headers: {
        Authorization: `Bearer ${params.token}`,
        'Content-Type': 'application/json',
      },
      timeout: accountTimeoutMs,
      validateStatus: () => true,
    });
    if (response.status !== 200) {
      return { desiredSessionEncryptionMode: 'e2ee', serverSupportsFeatureSnapshot, storagePolicy };
    }
    const parsed = AccountEncryptionModeResponseSchema.safeParse(response.data);
    if (!parsed.success) {
      return { desiredSessionEncryptionMode: 'e2ee', serverSupportsFeatureSnapshot, storagePolicy };
    }
    assertSessionEncryptionModeAllowedByEffectiveClientRequirement(parsed.data.mode);
    return {
      desiredSessionEncryptionMode: parsed.data.mode,
      serverSupportsFeatureSnapshot,
      storagePolicy,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('client requirement')) {
      throw error;
    }
    return { desiredSessionEncryptionMode: 'e2ee', serverSupportsFeatureSnapshot, storagePolicy };
  }
}

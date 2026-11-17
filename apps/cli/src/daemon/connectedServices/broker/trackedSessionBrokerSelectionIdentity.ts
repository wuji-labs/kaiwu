import {
  HAPPIER_SESSION_CONNECTED_SERVICE_BROKER_SELECTION_IDENTITY_ENV_KEY,
  readSessionConnectedServiceBrokerSelectionIdentity,
} from '@/agent/runtime/sessionConnectedServiceBrokerSelectionIdentityEnv';
import type { TrackedSession } from '@/daemon/types';

export function readTrackedSessionBrokerSelectionIdentity(tracked: Pick<
  TrackedSession,
  'happySessionMetadataFromLocalWebhook' | 'spawnOptions'
>): string | null {
  return readSessionConnectedServiceBrokerSelectionIdentity(
    tracked.happySessionMetadataFromLocalWebhook?.connectedServiceBrokerSelectionIdentityV1,
  ) ?? readSessionConnectedServiceBrokerSelectionIdentity(
    tracked.spawnOptions?.environmentVariables?.[
      HAPPIER_SESSION_CONNECTED_SERVICE_BROKER_SELECTION_IDENTITY_ENV_KEY
    ],
  );
}

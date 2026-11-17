import { describe, expect, it } from 'vitest';

import { DefaultTransport } from '@/agent/transport';

import { resolveAcpCatalogTransportHandler } from './resolveAcpCatalogTransportHandler';

describe('resolveAcpCatalogTransportHandler', () => {
  it('returns the default transport for the generic profile', () => {
    expect(resolveAcpCatalogTransportHandler('generic')).toBeInstanceOf(DefaultTransport);
  });
});

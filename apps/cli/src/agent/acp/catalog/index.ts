import type { AgentCatalogEntry } from '@/backends/types';

import { createCatalogDefinedAcpEntry } from './createCatalogDefinedAcpEntry';

export const BUILT_IN_CATALOG_DEFINED_ACP_AGENTS = {
  customAcp: createCatalogDefinedAcpEntry('customAcp'),
} as const satisfies Record<'customAcp', AgentCatalogEntry>;

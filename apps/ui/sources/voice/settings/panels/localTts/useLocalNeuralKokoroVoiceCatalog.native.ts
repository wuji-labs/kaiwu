import * as React from 'react';

import { getKokoroSherpaVoiceCatalogForSpeakerCount } from '@/voice/kokoro/voices/kokoroSherpaVoiceMapping';
import { fireAndForget } from '@/utils/system/fireAndForget';

import type { getModelPackInstallSummary } from '@/voice/modelPacks/installer.native';

export type KokoroVoiceSummary = Readonly<{
  id: string;
  title: string;
  subtitle?: string;
}>;

type InstallSummary = Awaited<ReturnType<typeof getModelPackInstallSummary>>;

function normalizeManifestVoiceRow(row: unknown): KokoroVoiceSummary | null {
  if (!row || typeof row !== 'object') return null;
  const id = (row as any).id;
  if (typeof id !== 'string' || id.trim().length === 0) return null;
  const titleRaw = (row as any).title;
  const subtitleRaw = (row as any).subtitle;
  return {
    id: String(id),
    title: typeof titleRaw === 'string' && titleRaw.trim().length > 0 ? titleRaw : String(id),
    subtitle: typeof subtitleRaw === 'string' && subtitleRaw.trim().length > 0 ? subtitleRaw : undefined,
  };
}

export function useLocalNeuralKokoroVoiceCatalog(params: {
  installSummary: InstallSummary | null;
}): KokoroVoiceSummary[] {
  const [voices, setVoices] = React.useState<KokoroVoiceSummary[]>([]);

  React.useEffect(() => {
    let canceled = false;

    fireAndForget((async () => {
      const manifestVoices: unknown[] | null =
        Array.isArray((params.installSummary as any)?.manifest?.voices) ? ((params.installSummary as any).manifest.voices as unknown[]) : null;

      if (manifestVoices && manifestVoices.length > 0) {
        const rows = manifestVoices.map(normalizeManifestVoiceRow).filter((row): row is KokoroVoiceSummary => Boolean(row));
        if (!canceled) setVoices(rows);
        return;
      }

      // Fallback: show a stable catalog so the dropdown is never empty.
      const fallback = getKokoroSherpaVoiceCatalogForSpeakerCount(53) ?? [];
      if (!canceled) setVoices(fallback.map((v) => ({ id: v.id, title: v.title, subtitle: v.subtitle })));
    })(), { tag: 'useLocalNeuralKokoroVoiceCatalog.load' });

    return () => {
      canceled = true;
    };
  }, [params.installSummary]);

  return voices;
}

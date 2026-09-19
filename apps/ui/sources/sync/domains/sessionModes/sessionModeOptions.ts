import { tLoose } from '@/text';

export type SessionModeOption = Readonly<{
    id: string;
    name: string;
    description?: string;
}>;

export type PreflightSessionModeList = Readonly<{
    availableModes: ReadonlyArray<SessionModeOption>;
}>;

export function resolveSessionModeDisplayName(modeId: string, rawName?: string | null): string {
    const trimmedLowerId = modeId.trim().toLowerCase();
    if (trimmedLowerId === 'default' || trimmedLowerId === 'build') {
        const translated = tLoose('agentInput.mode.build');
        return translated === 'agentInput.mode.build' ? 'Build' : translated;
    }
    if (trimmedLowerId === 'plan') {
        const translated = tLoose('agentInput.mode.plan');
        return translated === 'agentInput.mode.plan' ? 'Plan' : translated;
    }
    return typeof rawName === 'string' && rawName.trim().length > 0 ? rawName : modeId;
}

export function normalizeSessionModeOption(option: SessionModeOption): SessionModeOption {
    return {
        id: option.id,
        name: resolveSessionModeDisplayName(option.id, option.name),
        ...(typeof option.description === 'string' ? { description: option.description } : {}),
    };
}

export function normalizeSessionModeOptions(options: readonly SessionModeOption[]): readonly SessionModeOption[] {
    return options.map(normalizeSessionModeOption);
}

export function getSessionModeOptionsForPreflightModeList(list: PreflightSessionModeList): readonly SessionModeOption[] {
    const dynamic = (list.availableModes ?? [])
        .filter((m) => m && typeof m.id === 'string' && typeof m.name === 'string')
        .map((m) => ({
            id: String(m.id),
            name: String(m.name),
            ...(typeof m.description === 'string' ? { description: m.description } : {}),
        }));

    const existingDefault = dynamic.find((m) => m.id.trim().toLowerCase() === 'default') ?? null;
    const defaultOption: SessionModeOption = existingDefault
        ? normalizeSessionModeOption(existingDefault)
        : { id: 'default', name: tLoose('agentInput.mode.build') };

    const otherOptions = dynamic
        .filter((m) => m.id.trim().toLowerCase() !== 'default')
        .map(normalizeSessionModeOption);

    const withDefault: SessionModeOption[] = [
        defaultOption,
        ...otherOptions,
    ];

    const seen = new Set<string>();
    return withDefault.filter((opt) => {
        if (seen.has(opt.id)) return false;
        seen.add(opt.id);
        return true;
    });
}

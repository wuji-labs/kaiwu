import {
    ClientUpgradeRequiredV1Schema,
} from '@happier-dev/protocol';

function readRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export function readCliClientUpgradeRequired(value: unknown) {
    const record = readRecord(value);
    const rpcRegistrationPayload = record?.type === 'register'
        ? {
            error: record.error,
            requirement: record.requirement,
        }
        : null;
    const candidates = [
        value,
        rpcRegistrationPayload,
        record?.data,
        readRecord(record?.response)?.data,
    ];
    for (const candidate of candidates) {
        const parsed = ClientUpgradeRequiredV1Schema.safeParse(candidate);
        if (parsed.success) return parsed.data;
    }
    return null;
}

export class CliClientUpgradeRequiredError extends Error {
    readonly statusCode = 426;
    readonly requirement: NonNullable<ReturnType<typeof readCliClientUpgradeRequired>>['requirement'];

    constructor(payload: NonNullable<ReturnType<typeof readCliClientUpgradeRequired>>) {
        super('This Kaiwu client must be upgraded before it can sync sessions.');
        this.name = 'CliClientUpgradeRequiredError';
        this.requirement = payload.requirement;
    }
}

export function throwIfCliClientUpgradeRequired(status: number, payload: unknown): void {
    if (status !== 426) return;
    const parsed = readCliClientUpgradeRequired(payload);
    if (parsed) throw new CliClientUpgradeRequiredError(parsed);
}

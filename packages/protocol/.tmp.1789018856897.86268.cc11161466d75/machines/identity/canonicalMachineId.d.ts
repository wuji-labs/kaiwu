/**
 * Machine REPLACEMENT chain resolution — the single answer to "which machine is
 * machine X now?".
 *
 * A replaced machine keeps its row and gains a forward pointer
 * (`Machine.replacedByMachineId`); nothing re-homes the rows that named it, so a
 * Session, a recent path or an RPC target recorded before the replacement still
 * names the PREDECESSOR. Every consumer that wants to reach the machine such a
 * record refers to must therefore walk the chain, and they must all walk it the
 * same way: the client picks its RPC target with this walk, and the daemon
 * decides whether it hosts a Session with it. Two walks would let a client
 * address a successor the daemon then refuses as foreign.
 *
 * It lives here rather than in either app because both sides of that exchange
 * need it and neither owns the other.
 */
export type MachineIdentityRecord = Readonly<{
    id: string;
}>;
/**
 * Resolution only ever needs **lookup by machine id**. Callers that already hold
 * an id-keyed record must not have to destroy that index with `Object.values`,
 * and callers that genuinely hold a list (a server-scoped machine list, an RPC
 * response) must not have to build one. Both shapes are accepted; the walk is
 * bounded, so the list branch's scan costs no more than the index build it
 * replaces and allocates nothing.
 */
export type MachineCollection<TMachine extends MachineIdentityRecord> = ReadonlyArray<TMachine> | Readonly<Record<string, TMachine>>;
export type MachineReplacementRecord = Readonly<{
    id: string;
    replacedByMachineId?: string | null;
    replacedAt?: unknown;
}>;
export type CanonicalMachineResolution = Readonly<{
    machineId: string;
    reason: 'direct' | 'replacement' | 'missingReplacementTarget';
    chain: readonly string[];
}>;
export declare function normalizeMachineIdentityString(value: unknown): string | null;
export declare function isMachineReplaced(machine: Readonly<{
    replacedByMachineId?: string | null;
    replacedAt?: unknown;
}> | null | undefined): boolean;
/**
 * Find the machine registered under `machineId`, in either shape.
 *
 * The record branch accepts an entry only when its own `id` matches the key it is
 * filed under, so a machine resolves by its identity rather than by whatever key
 * it was stored under and an inherited property (`constructor`, `__proto__`) can
 * never be mistaken for a machine. The list branch resolves the LAST matching
 * entry, matching the id-keyed index this replaced; every production list is
 * produced from an id-keyed record, so at most one entry per id exists and the
 * direction is unobservable.
 */
export declare function findMachineInCollection<TMachine extends MachineIdentityRecord>(machines: MachineCollection<TMachine> | null | undefined, machineId: string): TMachine | null;
export declare function resolveCanonicalMachineId(machineIdInput: string | null | undefined, machines: MachineCollection<MachineReplacementRecord>): CanonicalMachineResolution | null;
//# sourceMappingURL=canonicalMachineId.d.ts.map
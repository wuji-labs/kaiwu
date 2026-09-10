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
const MAX_REPLACEMENT_CHAIN_LENGTH = 16;
export function normalizeMachineIdentityString(value) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
export function isMachineReplaced(machine) {
    return Boolean(normalizeMachineIdentityString(machine?.replacedByMachineId));
}
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
export function findMachineInCollection(machines, machineId) {
    if (!machines)
        return null;
    if (Array.isArray(machines)) {
        for (let index = machines.length - 1; index >= 0; index -= 1) {
            const machine = machines[index];
            if (machine && machine.id === machineId)
                return machine;
        }
        return null;
    }
    const machine = machines[machineId];
    return machine && machine.id === machineId ? machine : null;
}
export function resolveCanonicalMachineId(machineIdInput, machines) {
    const machineId = normalizeMachineIdentityString(machineIdInput);
    if (!machineId)
        return null;
    if (machineId.startsWith('host:'))
        return null;
    const chain = [];
    const visited = new Set();
    let currentMachineId = machineId;
    for (let depth = 0; depth < MAX_REPLACEMENT_CHAIN_LENGTH; depth += 1) {
        if (visited.has(currentMachineId))
            return null;
        visited.add(currentMachineId);
        chain.push(currentMachineId);
        const machine = findMachineInCollection(machines, currentMachineId);
        if (!machine || !isMachineReplaced(machine)) {
            return {
                machineId: currentMachineId,
                reason: currentMachineId === machineId ? 'direct' : 'replacement',
                chain,
            };
        }
        const replacementMachineId = normalizeMachineIdentityString(machine.replacedByMachineId);
        if (!replacementMachineId || replacementMachineId === currentMachineId)
            return null;
        if (!findMachineInCollection(machines, replacementMachineId)) {
            return {
                machineId: currentMachineId,
                reason: 'missingReplacementTarget',
                chain,
            };
        }
        currentMachineId = replacementMachineId;
    }
    return null;
}
//# sourceMappingURL=canonicalMachineId.js.map
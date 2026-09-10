/**
 * `ExecutionRunStatus` (daemon execution-run registry) -> presentation status.
 *
 * The source enum is unchanged and still the wire contract. No `default` arm: a value added
 * upstream must fail to compile here.
 *
 * `timeout` has its own presentation status. Collapsing it into `succeeded` is defect D-1 — a run
 * the daemon timed out rendering as a green success is a lie the user cannot see through, and
 * timing out has a different recovery (raise the budget) than failing (read the error).
 */
export function fromExecutionRunStatus(status) {
    switch (status) {
        case 'running':
            return 'running';
        case 'succeeded':
            return 'succeeded';
        case 'failed':
            return 'failed';
        case 'cancelled':
            return 'cancelled';
        case 'timeout':
            return 'timedOut';
        default: {
            const exhaustive = status;
            return exhaustive;
        }
    }
}
//# sourceMappingURL=fromExecutionRunStatus.js.map
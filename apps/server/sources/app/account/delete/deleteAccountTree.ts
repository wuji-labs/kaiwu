import { type Tx } from "@/storage/inTx";

/**
 * Deletes an account and all of its associated server-side data in leaf-to-root order
 * within a single database transaction.
 */
export async function deleteAccountTree(
    tx: Tx,
    accountId: string,
): Promise<{
    deletedSessions: number;
    deletedMachines: number;
}> {
    // 1. Gather all owned entity IDs needed for cascade relations
    const [
        ownedSessions,
        ownedMachines,
        ownedAutomations,
        ownedAuthGroups,
        ownedPetPackages,
        ownedArtifacts,
    ] = await Promise.all([
        tx.session.findMany({ where: { accountId }, select: { id: true } }),
        tx.machine.findMany({ where: { accountId }, select: { id: true } }),
        tx.automation.findMany({ where: { accountId }, select: { id: true } }),
        tx.connectedServiceAuthGroup.findMany({ where: { accountId }, select: { id: true } }),
        tx.accountPetPackage.findMany({ where: { accountId }, select: { id: true } }),
        tx.artifact.findMany({ where: { accountId }, select: { id: true } }),
    ]);

    const ownedSessionIds = ownedSessions.map((s) => s.id);
    const ownedMachineIds = ownedMachines.map((m) => m.id);
    const ownedAutomationIds = ownedAutomations.map((a) => a.id);
    const ownedAuthGroupIds = ownedAuthGroups.map((g) => g.id);
    const ownedPetPackageIds = ownedPetPackages.map((p) => p.id);
    const ownedArtifactIds = ownedArtifacts.map((a) => a.id);

    const [
        ownedAutomationRuns,
        sessionShares,
        publicShares,
    ] = await Promise.all([
        tx.automationRun.findMany({
            where: {
                OR: [
                    { accountId },
                    ...(ownedAutomationIds.length > 0 ? [{ automationId: { in: ownedAutomationIds } }] : []),
                ],
            },
            select: { id: true },
        }),
        tx.sessionShare.findMany({
            where: {
                OR: [
                    { sharedByUserId: accountId },
                    { sharedWithUserId: accountId },
                    ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
                ],
            },
            select: { id: true },
        }),
        tx.publicSessionShare.findMany({
            where: {
                OR: [
                    { createdByUserId: accountId },
                    ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
                ],
            },
            select: { id: true },
        }),
    ]);

    const ownedAutomationRunIds = ownedAutomationRuns.map((r) => r.id);
    const sessionShareIds = sessionShares.map((s) => s.id);
    const publicShareIds = publicShares.map((s) => s.id);

    // 2. Automations (events -> runs -> assignments -> automations)
    if (ownedAutomationRunIds.length > 0) {
        await tx.automationRunEvent.deleteMany({
            where: { runId: { in: ownedAutomationRunIds } },
        });
        await tx.automationRun.deleteMany({
            where: { id: { in: ownedAutomationRunIds } },
        });
    }

    if (ownedAutomationIds.length > 0 || ownedMachineIds.length > 0) {
        await tx.automationAssignment.deleteMany({
            where: {
                OR: [
                    ...(ownedAutomationIds.length > 0 ? [{ automationId: { in: ownedAutomationIds } }] : []),
                    ...(ownedMachineIds.length > 0 ? [{ machineId: { in: ownedMachineIds } }] : []),
                ],
            },
        });
    }

    await tx.automation.deleteMany({
        where: { accountId },
    });

    // 3. Connected services & provider usage
    await tx.connectedServiceAuthGroupMember.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedAuthGroupIds.length > 0 ? [{ groupDbId: { in: ownedAuthGroupIds } }] : []),
            ],
        },
    });

    await tx.connectedServiceAuthGroup.deleteMany({
        where: { accountId },
    });

    await tx.connectedServiceUsageSource.deleteMany({
        where: { accountId },
    });

    await tx.providerAccountUsageRecord.deleteMany({
        where: { accountId },
    });

    await tx.serviceAccountToken.deleteMany({
        where: { accountId },
    });

    // 4. Public shares & reports & access logs
    await tx.publicShareAccessLog.deleteMany({
        where: {
            OR: [
                { userId: accountId },
                ...(publicShareIds.length > 0 ? [{ publicShareId: { in: publicShareIds } }] : []),
            ],
        },
    });

    await tx.publicSessionShare.deleteMany({
        where: {
            OR: [
                { createdByUserId: accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    await tx.publicShareReport.deleteMany({
        where: { accountId },
    });

    // 5. Direct session shares & access logs
    await tx.sessionShareAccessLog.deleteMany({
        where: {
            OR: [
                { userId: accountId },
                ...(sessionShareIds.length > 0 ? [{ sessionShareId: { in: sessionShareIds } }] : []),
            ],
        },
    });

    await tx.sessionShare.deleteMany({
        where: {
            OR: [
                { sharedByUserId: accountId },
                { sharedWithUserId: accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    // 6. Session children
    if (ownedSessionIds.length > 0) {
        await tx.sessionMessage.deleteMany({
            where: { sessionId: { in: ownedSessionIds } },
        });

        await tx.sessionTurnMutationReceipt.deleteMany({
            where: { sessionId: { in: ownedSessionIds } },
        });

        await tx.sessionTurn.deleteMany({
            where: { sessionId: { in: ownedSessionIds } },
        });
    }

    await tx.sessionPendingMessage.deleteMany({
        where: {
            OR: [
                { authorAccountId: accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    await tx.sessionSystemRecord.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    await tx.sessionFolderAssignment.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    await tx.sessionTagAssignment.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    await tx.sessionPin.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    await tx.sessionAttentionStanding.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    await tx.usageReport.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    await tx.accessKey.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
                ...(ownedMachineIds.length > 0 ? [{ machineId: { in: ownedMachineIds } }] : []),
            ],
        },
    });

    await tx.voiceConversation.deleteMany({
        where: { accountId },
    });

    await tx.voiceSessionLease.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
            ],
        },
    });

    // 7. Organization entities
    await tx.sessionOrganizationOrderEntry.deleteMany({
        where: { accountId },
    });
    await tx.sessionOrganizationLabel.deleteMany({
        where: { accountId },
    });
    await tx.sessionOrganizationCheckpoint.deleteMany({
        where: { accountId },
    });
    await tx.sessionOrganizationFolder.deleteMany({
        where: { accountId },
    });
    await tx.sessionOrganizationTag.deleteMany({
        where: { accountId },
    });

    // 8. Account changes
    await tx.accountChange.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedSessionIds.length > 0 ? [{ sessionId: { in: ownedSessionIds } }] : []),
                ...(ownedMachineIds.length > 0 ? [{ machineId: { in: ownedMachineIds } }] : []),
                ...(ownedArtifactIds.length > 0 ? [{ artifactId: { in: ownedArtifactIds } }] : []),
                ...(ownedPetPackageIds.length > 0 ? [{ accountPetPackageId: { in: ownedPetPackageIds } }] : []),
            ],
        },
    });

    // 9. Sessions & Machines
    const deletedSessions = await tx.session.deleteMany({
        where: { accountId },
    });

    const deletedMachines = await tx.machine.deleteMany({
        where: { accountId },
    });

    // 10. Pets
    await tx.accountPetAsset.deleteMany({
        where: {
            OR: [
                { accountId },
                ...(ownedPetPackageIds.length > 0 ? [{ petPackageId: { in: ownedPetPackageIds } }] : []),
            ],
        },
    });
    await tx.accountPetPackage.deleteMany({
        where: { accountId },
    });

    // 11. Artifacts & uploads
    await tx.artifact.deleteMany({
        where: { accountId },
    });
    await tx.uploadedFile.deleteMany({
        where: { accountId },
    });

    // 12. Social & KV
    await tx.userRelationship.deleteMany({
        where: {
            OR: [
                { fromUserId: accountId },
                { toUserId: accountId },
            ],
        },
    });
    await tx.userFeedItem.deleteMany({
        where: { userId: accountId },
    });
    await tx.userKVStore.deleteMany({
        where: { accountId },
    });

    // 13. Auth tokens & pairing & identities & snapshots
    await tx.terminalAuthRequest.deleteMany({
        where: { responseAccountId: accountId },
    });
    await tx.accountAuthRequest.deleteMany({
        where: { responseAccountId: accountId },
    });
    await tx.authPairingSession.deleteMany({
        where: { accountId },
    });
    await tx.accountPushToken.deleteMany({
        where: { accountId },
    });
    await tx.accountIdentity.deleteMany({
        where: { accountId },
    });
    await tx.accountSettingsSnapshot.deleteMany({
        where: { accountId },
    });

    // 14. Root Account row
    await tx.account.delete({
        where: { id: accountId },
    });

    return {
        deletedSessions: deletedSessions.count,
        deletedMachines: deletedMachines.count,
    };
}

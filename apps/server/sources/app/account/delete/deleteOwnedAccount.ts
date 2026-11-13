import { inTx, afterTx } from "@/storage/inTx";
import { log } from "@/utils/logging/log";
import { auth } from "@/app/auth/auth";
import { invalidateSessionRelayAuthorizationForSession } from "@/app/api/socket/sessionRelayAuthCache";
import { deleteAccountTree } from "./deleteAccountTree";

export async function deleteOwnedAccount(params: {
    accountId: string;
}): Promise<{ success: boolean; deletedSessions: number; deletedMachines: number }> {
    return await inTx(async (tx) => {
        const account = await tx.account.findUnique({
            where: { id: params.accountId },
            select: { id: true },
        });

        if (!account) {
            log(
                { module: "account-delete", userId: params.accountId },
                "Account not found for deletion",
            );
            return { success: false, deletedSessions: 0, deletedMachines: 0 };
        }

        const ownedSessions = await tx.session.findMany({
            where: { accountId: params.accountId },
            select: { id: true },
        });
        const ownedSessionIds = ownedSessions.map((s) => s.id);

        const result = await deleteAccountTree(tx, params.accountId);

        afterTx(tx, async () => {
            // 1. Invalidate all auth tokens cached for this user
            auth.invalidateUserTokens(params.accountId);

            // 2. Invalidate session relay authorizations for owned sessions
            for (const sessionId of ownedSessionIds) {
                invalidateSessionRelayAuthorizationForSession(sessionId);
            }

            log(
                {
                    module: "account-delete",
                    userId: params.accountId,
                    deletedSessions: result.deletedSessions,
                    deletedMachines: result.deletedMachines,
                },
                "Account deleted successfully and tokens invalidated",
            );
        });

        return {
            success: true,
            deletedSessions: result.deletedSessions,
            deletedMachines: result.deletedMachines,
        };
    });
}

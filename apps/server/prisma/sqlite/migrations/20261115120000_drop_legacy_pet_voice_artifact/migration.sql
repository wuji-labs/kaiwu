-- DropIndex
DROP INDEX "VoiceSessionLease_accountId_expiresAt_idx";

-- DropIndex
DROP INDEX "VoiceSessionLease_accountId_periodKey_idx";

-- DropIndex
DROP INDEX "VoiceSessionLease_expiresAt_idx";

-- DropIndex
DROP INDEX "VoiceConversation_leaseId_key";

-- DropIndex
DROP INDEX "VoiceConversation_accountId_createdAt_idx";

-- DropIndex
DROP INDEX "VoiceConversation_accountId_providerId_createdAt_idx";

-- DropIndex
DROP INDEX "VoiceConversation_providerId_providerConversationId_key";

-- DropIndex
DROP INDEX "AccountPetPackage_accountId_deletedAt_updatedAt_idx";

-- DropIndex
DROP INDEX "AccountPetPackage_accountId_digest_idx";

-- DropIndex
DROP INDEX "AccountPetPackage_accountId_id_key";

-- DropIndex
DROP INDEX "AccountPetAsset_accountId_idx";

-- DropIndex
DROP INDEX "AccountPetAsset_accountId_petPackageId_idx";

-- DropIndex
DROP INDEX "AccountPetAsset_petPackageId_idx";

-- DropIndex
DROP INDEX "AccountPetAsset_accountId_objectKey_key";

-- DropIndex
DROP INDEX "Artifact_accountId_idx";

-- DropIndex
DROP INDEX "Artifact_accountId_updatedAt_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "VoiceSessionLease";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "VoiceConversation";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AccountPetPackage";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AccountPetAsset";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Artifact";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AccountChange" (
    "accountId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "cursor" INTEGER NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hint" JSONB,
    "sessionId" TEXT,
    "machineId" TEXT,

    PRIMARY KEY ("accountId", "kind", "entityId"),
    CONSTRAINT "AccountChange_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountChange_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountChange_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AccountChange" ("accountId", "changedAt", "cursor", "entityId", "hint", "kind", "machineId", "sessionId") SELECT "accountId", "changedAt", "cursor", "entityId", "hint", "kind", "machineId", "sessionId" FROM "AccountChange";
DROP TABLE "AccountChange";
ALTER TABLE "new_AccountChange" RENAME TO "AccountChange";
CREATE INDEX "AccountChange_accountId_cursor_idx" ON "AccountChange"("accountId", "cursor");
CREATE INDEX "AccountChange_changedAt_accountId_cursor_idx" ON "AccountChange"("changedAt", "accountId", "cursor");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


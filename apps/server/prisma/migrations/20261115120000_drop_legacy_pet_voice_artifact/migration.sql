-- DropForeignKey
ALTER TABLE "VoiceSessionLease" DROP CONSTRAINT "VoiceSessionLease_accountId_fkey";

-- DropForeignKey
ALTER TABLE "VoiceConversation" DROP CONSTRAINT "VoiceConversation_accountId_fkey";

-- DropForeignKey
ALTER TABLE "VoiceConversation" DROP CONSTRAINT "VoiceConversation_leaseId_fkey";

-- DropForeignKey
ALTER TABLE "AccountChange" DROP CONSTRAINT "AccountChange_artifactId_fkey";

-- DropForeignKey
ALTER TABLE "AccountChange" DROP CONSTRAINT "AccountChange_accountPetPackageId_fkey";

-- DropForeignKey
ALTER TABLE "AccountPetPackage" DROP CONSTRAINT "AccountPetPackage_accountId_fkey";

-- DropForeignKey
ALTER TABLE "AccountPetAsset" DROP CONSTRAINT "AccountPetAsset_accountId_fkey";

-- DropForeignKey
ALTER TABLE "AccountPetAsset" DROP CONSTRAINT "AccountPetAsset_accountId_petPackageId_fkey";

-- DropForeignKey
ALTER TABLE "Artifact" DROP CONSTRAINT "Artifact_accountId_fkey";

-- AlterTable
ALTER TABLE "AccountChange" DROP COLUMN "accountPetPackageId",
DROP COLUMN "artifactId";

-- DropTable
DROP TABLE "VoiceSessionLease";

-- DropTable
DROP TABLE "VoiceConversation";

-- DropTable
DROP TABLE "AccountPetPackage";

-- DropTable
DROP TABLE "AccountPetAsset";

-- DropTable
DROP TABLE "Artifact";


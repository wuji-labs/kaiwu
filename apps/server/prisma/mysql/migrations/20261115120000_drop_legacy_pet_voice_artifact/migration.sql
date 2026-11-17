-- DropForeignKey
ALTER TABLE `VoiceSessionLease` DROP FOREIGN KEY `VoiceSessionLease_accountId_fkey`;

-- DropForeignKey
ALTER TABLE `VoiceConversation` DROP FOREIGN KEY `VoiceConversation_accountId_fkey`;

-- DropForeignKey
ALTER TABLE `VoiceConversation` DROP FOREIGN KEY `VoiceConversation_leaseId_fkey`;

-- DropForeignKey
ALTER TABLE `AccountChange` DROP FOREIGN KEY `AccountChange_artifactId_fkey`;

-- DropForeignKey
ALTER TABLE `AccountChange` DROP FOREIGN KEY `AccountChange_accountPetPackageId_fkey`;

-- DropForeignKey
ALTER TABLE `AccountPetPackage` DROP FOREIGN KEY `AccountPetPackage_accountId_fkey`;

-- DropForeignKey
ALTER TABLE `AccountPetAsset` DROP FOREIGN KEY `AccountPetAsset_accountId_fkey`;

-- DropForeignKey
ALTER TABLE `AccountPetAsset` DROP FOREIGN KEY `AccountPetAsset_accountId_petPackageId_fkey`;

-- DropForeignKey
ALTER TABLE `Artifact` DROP FOREIGN KEY `Artifact_accountId_fkey`;

-- AlterTable
ALTER TABLE `AccountChange` DROP COLUMN `accountPetPackageId`,
    DROP COLUMN `artifactId`;

-- DropTable
DROP TABLE `VoiceSessionLease`;

-- DropTable
DROP TABLE `VoiceConversation`;

-- DropTable
DROP TABLE `AccountPetPackage`;

-- DropTable
DROP TABLE `AccountPetAsset`;

-- DropTable
DROP TABLE `Artifact`;


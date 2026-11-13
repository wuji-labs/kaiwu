-- CreateTable
CREATE TABLE `PublicShareReport` (
    `id` VARCHAR(191) NOT NULL,
    `shareToken` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NOT NULL,
    `details` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PublicShareReport_shareToken_idx`(`shareToken`),
    INDEX `PublicShareReport_accountId_idx`(`accountId`),
    INDEX `PublicShareReport_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PublicShareReport` ADD CONSTRAINT `PublicShareReport_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

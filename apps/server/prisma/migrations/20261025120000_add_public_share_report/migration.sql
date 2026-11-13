-- CreateTable
CREATE TABLE "PublicShareReport" (
    "id" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "accountId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicShareReport_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PublicShareReport" ADD CONSTRAINT "PublicShareReport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PublicShareReport_shareToken_idx" ON "PublicShareReport"("shareToken");

-- CreateIndex
CREATE INDEX "PublicShareReport_accountId_idx" ON "PublicShareReport"("accountId");

-- CreateIndex
CREATE INDEX "PublicShareReport_createdAt_idx" ON "PublicShareReport"("createdAt");

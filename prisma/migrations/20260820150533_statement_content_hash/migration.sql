-- AlterTable
ALTER TABLE "BankStatement" ADD COLUMN     "contentHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_bankAccountId_contentHash_key" ON "BankStatement"("bankAccountId", "contentHash");


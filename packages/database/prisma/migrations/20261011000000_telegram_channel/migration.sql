-- AlterEnum
ALTER TYPE "MessageChannel" ADD VALUE 'TELEGRAM';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "telegramChatId" TEXT,
ADD COLUMN "telegramLinkToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_telegramLinkToken_key" ON "Customer"("telegramLinkToken");

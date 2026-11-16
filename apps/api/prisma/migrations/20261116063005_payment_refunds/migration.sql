-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REFUNDED', 'FAILED');

-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "refundError" TEXT,
ADD COLUMN     "refundStatus" "RefundStatus",
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_createdAt_idx" ON "PaymentAttempt"("status", "createdAt");

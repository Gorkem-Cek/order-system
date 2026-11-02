-- DropIndex
DROP INDEX "WaiterCall_tableId_createdAt_idx";

-- AlterTable
ALTER TABLE "WaiterCall" ADD COLUMN     "callCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastCalledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "WaiterCall_tableId_status_idx" ON "WaiterCall"("tableId", "status");

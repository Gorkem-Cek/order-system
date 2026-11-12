-- CreateEnum
CREATE TYPE "IyzicoMode" AS ENUM ('SANDBOX', 'LIVE');

-- AlterTable
ALTER TABLE "Cafe" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "iyzicoApiKey" TEXT,
ADD COLUMN     "iyzicoMode" "IyzicoMode",
ADD COLUMN     "iyzicoSecretKey" TEXT;

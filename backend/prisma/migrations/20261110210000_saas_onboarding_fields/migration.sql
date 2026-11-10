-- AlterEnum
ALTER TYPE "StaffRole" ADD VALUE 'SUPERADMIN';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "phone" TEXT;
ALTER TABLE "Organization" ADD COLUMN "address" TEXT;

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "allowedLinkOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];


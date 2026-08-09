-- Mark bhajans added in the app, as distinct from the imported masterlist.
-- Additive with a default, so all 3,607 imported rows are untouched.

-- CreateEnum
CREATE TYPE "BhajanOrigin" AS ENUM ('masterlist', 'local');

-- AlterTable
ALTER TABLE "Bhajan" ADD COLUMN     "origin" "BhajanOrigin" NOT NULL DEFAULT 'masterlist',
ADD COLUMN     "originNote" TEXT;


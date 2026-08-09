-- Personal learning list: two new RepertoireKind values plus a note and
-- a preferred shruti. Additive; the 485 imported repertoire rows keep
-- their kind and gain nulls.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RepertoireKind" ADD VALUE 'wantToLearn';
ALTER TYPE "RepertoireKind" ADD VALUE 'learning';

-- AlterTable
ALTER TABLE "SingerRepertoire" ADD COLUMN     "note" TEXT,
ADD COLUMN     "preferredPitch" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;


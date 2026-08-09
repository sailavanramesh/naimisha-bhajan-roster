-- Make SessionSlot.singerId optional, and stop cascading singer deletes.
--
-- A draft session from the builder has bhajans chosen but no singers yet —
-- rostering (Phase 3) fills those in. The chosen bhajans must be PERSISTED
-- rather than re-derived from the seed: the generator's weights depend on how
-- long ago each bhajan was last sung, so once new history is recorded the same
-- seed no longer reproduces the same set.
--
-- The FK also moves from ON DELETE CASCADE to ON DELETE SET NULL. Deleting a
-- singer must never silently take 99 rows of confirmedPitch with it.
--
-- Non-destructive: relaxing NOT NULL cannot fail, and no existing row changes.

-- DropForeignKey
ALTER TABLE "SessionSlot" DROP CONSTRAINT "SessionSlot_singerId_fkey";

-- AlterTable
ALTER TABLE "SessionSlot" ALTER COLUMN "singerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "SessionSlot" ADD CONSTRAINT "SessionSlot_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


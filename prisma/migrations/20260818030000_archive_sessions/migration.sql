-- Deleting a session archives it instead.
--
-- Sailavan, 2026-08-18: a removed session or programme "should be removed from
-- all views but kept as an archived session or program that the Owner can
-- review and either restore or permanently delete, to have as a fallback in
-- case some accidental mistakes have been made."
--
-- Null is the ordinary state, so every existing session is untouched and
-- visible. Every list and every history filters on this — see lib/archive.ts.

-- AlterTable
ALTER TABLE "Session" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Session" ADD COLUMN "archivedBy" TEXT;

-- CreateIndex
CREATE INDEX "Session_archivedAt_idx" ON "Session"("archivedAt");

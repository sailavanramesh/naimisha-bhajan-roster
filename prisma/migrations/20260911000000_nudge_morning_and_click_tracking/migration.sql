-- AlterEnum: add nudge_morning between published and nudge
-- PostgreSQL requires ALTER TYPE … ADD VALUE; the position hint is advisory only.
ALTER TYPE "NoticeKind" ADD VALUE 'nudge_morning' AFTER 'published';

-- AlterTable: add optional clickedAt to SessionNotice
ALTER TABLE "SessionNotice" ADD COLUMN "clickedAt" TIMESTAMP(3);

-- v2 schema. See docs/SPEC.md §5.
--
-- SAFETY NOTE. This migration DROPS SessionSinger, FestivalBhajan and
-- PitchLookup and recreates their successors (SessionSlot, SingerRepertoire,
-- PitchLabel). That is only safe because it runs exactly once, against the
-- freshly provisioned Azure database, BEFORE the first seed — at the time of
-- writing those tables hold zero rows.
--
-- Every migration after this one must be non-destructive. The 709 rows of
-- confirmedPitch / historicalRecommendedPitch in SessionSlot exist nowhere
-- else, and no backup of them predates this database.

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('Gents', 'Ladies');

-- CreateEnum
CREATE TYPE "Series" AS ENUM ('Madhyam', 'Pancham');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('Weekday', 'Sunday', 'Festival');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('Draft', 'Published');

-- CreateEnum
CREATE TYPE "RepertoireKind" AS ENUM ('known', 'festival');

-- CreateEnum
CREATE TYPE "RuleStrength" AS ENUM ('hard', 'soft');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('coordinator', 'singer', 'viewer');

-- DropForeignKey
ALTER TABLE "FestivalBhajan" DROP CONSTRAINT "FestivalBhajan_bhajanId_fkey";

-- DropForeignKey
ALTER TABLE "FestivalBhajan" DROP CONSTRAINT "FestivalBhajan_singerId_fkey";

-- DropForeignKey
ALTER TABLE "SessionSinger" DROP CONSTRAINT "SessionSinger_bhajanId_fkey";

-- DropForeignKey
ALTER TABLE "SessionSinger" DROP CONSTRAINT "SessionSinger_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "SessionSinger" DROP CONSTRAINT "SessionSinger_singerId_fkey";

-- AlterTable
-- Full-text search vector, maintained by Postgres itself so it can never drift
-- from the row. Weighted title > glossary > meaning > lyrics.
--
-- The 'simple' configuration is deliberate: these are transliterated Sanskrit
-- titles, and English stemming mangles them ("Bhajo" -> "Bhajo", but
-- "Vandana"/"Vandanam" would collapse inconsistently). 'simple' just
-- lowercases and splits, which is what we want here.
ALTER TABLE "Bhajan" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("glossaryTerms", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("meaning", '')), 'C') ||
    setweight(to_tsvector('simple', coalesce("lyrics", '')), 'D')
  ) STORED;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "seed" TEXT,
ADD COLUMN     "status" "SessionStatus" NOT NULL DEFAULT 'Published',
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "type" "SessionType" NOT NULL DEFAULT 'Weekday',
ALTER COLUMN "date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "Singer" ADD COLUMN     "email" TEXT,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'singer',
DROP COLUMN "gender",
ADD COLUMN     "gender" "Gender";

-- DropTable
DROP TABLE "FestivalBhajan";

-- DropTable
DROP TABLE "PitchLookup";

-- DropTable
DROP TABLE "SessionSinger";

-- CreateTable
CREATE TABLE "Deity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Deity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BhajanDeity" (
    "bhajanId" TEXT NOT NULL,
    "deityId" TEXT NOT NULL,

    CONSTRAINT "BhajanDeity_pkey" PRIMARY KEY ("bhajanId","deityId")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BhajanTag" (
    "bhajanId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "BhajanTag_pkey" PRIMARY KEY ("bhajanId","tagId")
);

-- CreateTable
CREATE TABLE "SessionSlot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "bhajanId" TEXT,
    "position" INTEGER NOT NULL,
    "bhajanTitle" TEXT,
    "festivalBhajanTitle" TEXT,
    "inputOnlyCustomBhajan" TEXT,
    "confirmedPitch" TEXT,
    "historicalRecommendedPitch" TEXT,
    "alternativeTablaPitch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SingerRepertoire" (
    "id" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "bhajanId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "RepertoireKind" NOT NULL,
    "order" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SingerRepertoire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SingerAvailability" (
    "id" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "SingerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultLength" INTEGER NOT NULL DEFAULT 3,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotRule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "strength" "RuleStrength" NOT NULL DEFAULT 'soft',
    "deity" TEXT,
    "tempoIn" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,

    CONSTRAINT "SlotRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchLabel" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "step" DOUBLE PRECISION NOT NULL,
    "series" "Series" NOT NULL,
    "note" TEXT NOT NULL,
    "semitone" INTEGER NOT NULL,
    "tablaPitch" TEXT,
    "value" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deity_name_key" ON "Deity"("name");

-- CreateIndex
CREATE INDEX "BhajanDeity_deityId_idx" ON "BhajanDeity"("deityId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "BhajanTag_tagId_idx" ON "BhajanTag"("tagId");

-- CreateIndex
CREATE INDEX "SessionSlot_sessionId_idx" ON "SessionSlot"("sessionId");

-- CreateIndex
CREATE INDEX "SessionSlot_singerId_idx" ON "SessionSlot"("singerId");

-- CreateIndex
CREATE INDEX "SessionSlot_bhajanId_idx" ON "SessionSlot"("bhajanId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSlot_sessionId_position_key" ON "SessionSlot"("sessionId", "position");

-- CreateIndex
CREATE INDEX "SingerRepertoire_singerId_idx" ON "SingerRepertoire"("singerId");

-- CreateIndex
CREATE INDEX "SingerRepertoire_bhajanId_idx" ON "SingerRepertoire"("bhajanId");

-- CreateIndex
CREATE UNIQUE INDEX "SingerRepertoire_singerId_kind_title_key" ON "SingerRepertoire"("singerId", "kind", "title");

-- CreateIndex
CREATE INDEX "SingerAvailability_date_idx" ON "SingerAvailability"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SingerAvailability_singerId_date_key" ON "SingerAvailability"("singerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SessionTemplate_name_key" ON "SessionTemplate"("name");

-- CreateIndex
CREATE INDEX "SlotRule_templateId_idx" ON "SlotRule"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotRule_templateId_position_key" ON "SlotRule"("templateId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PitchLabel_label_key" ON "PitchLabel"("label");

-- CreateIndex
CREATE INDEX "PitchLabel_semitone_idx" ON "PitchLabel"("semitone");

-- CreateIndex
CREATE INDEX "Bhajan_searchVector_idx" ON "Bhajan" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "Bhajan_raga_idx" ON "Bhajan"("raga");

-- CreateIndex
CREATE INDEX "Bhajan_tempo_idx" ON "Bhajan"("tempo");

-- CreateIndex
CREATE INDEX "Session_templateId_idx" ON "Session"("templateId");

-- CreateIndex
CREATE INDEX "Session_date_idx" ON "Session"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Singer_email_key" ON "Singer"("email");

-- AddForeignKey
ALTER TABLE "BhajanDeity" ADD CONSTRAINT "BhajanDeity_bhajanId_fkey" FOREIGN KEY ("bhajanId") REFERENCES "Bhajan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BhajanDeity" ADD CONSTRAINT "BhajanDeity_deityId_fkey" FOREIGN KEY ("deityId") REFERENCES "Deity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BhajanTag" ADD CONSTRAINT "BhajanTag_bhajanId_fkey" FOREIGN KEY ("bhajanId") REFERENCES "Bhajan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BhajanTag" ADD CONSTRAINT "BhajanTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SessionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSlot" ADD CONSTRAINT "SessionSlot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSlot" ADD CONSTRAINT "SessionSlot_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSlot" ADD CONSTRAINT "SessionSlot_bhajanId_fkey" FOREIGN KEY ("bhajanId") REFERENCES "Bhajan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SingerRepertoire" ADD CONSTRAINT "SingerRepertoire_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SingerRepertoire" ADD CONSTRAINT "SingerRepertoire_bhajanId_fkey" FOREIGN KEY ("bhajanId") REFERENCES "Bhajan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SingerAvailability" ADD CONSTRAINT "SingerAvailability_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotRule" ADD CONSTRAINT "SlotRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SessionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;


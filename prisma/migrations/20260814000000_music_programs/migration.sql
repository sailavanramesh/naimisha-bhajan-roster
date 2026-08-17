-- CreateEnum
CREATE TYPE "SessionFormat" AS ENUM ('bhajans', 'program');

-- CreateEnum
CREATE TYPE "CategoryScope" AS ENUM ('bhajans', 'program');

-- CreateEnum
CREATE TYPE "ProgramItemKind" AS ENUM ('song', 'narration');

-- CreateEnum
CREATE TYPE "InstrumentScope" AS ENUM ('bhajans', 'program', 'both');

-- CreateEnum
CREATE TYPE "SessionJob" AS ENUM ('soundEngineer', 'micCoordinator');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "format" "SessionFormat" NOT NULL DEFAULT 'bhajans';

-- AlterTable
ALTER TABLE "SessionCategory" ADD COLUMN     "scope" "CategoryScope" NOT NULL DEFAULT 'bhajans';

-- CreateTable
CREATE TABLE "ProgramItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "ProgramItemKind" NOT NULL DEFAULT 'song',
    "narration" TEXT,
    "songId" TEXT,
    "title" TEXT,
    "pitchNote" TEXT,
    "pitchLabel" TEXT,
    "bpm" INTEGER,
    "referenceUrl" TEXT,
    "arrangement" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramPerformer" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "singerId" TEXT,
    "name" TEXT,
    "part" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramPerformer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "scope" "InstrumentScope" NOT NULL DEFAULT 'program',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramItemInstrument" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "singerId" TEXT,
    "person" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramItemInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionCrew" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "job" "SessionJob" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionCrew_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramItem_sessionId_idx" ON "ProgramItem"("sessionId");

-- CreateIndex
CREATE INDEX "ProgramItem_songId_idx" ON "ProgramItem"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramItem_sessionId_position_key" ON "ProgramItem"("sessionId", "position");

-- CreateIndex
CREATE INDEX "ProgramPerformer_itemId_idx" ON "ProgramPerformer"("itemId");

-- CreateIndex
CREATE INDEX "ProgramPerformer_singerId_idx" ON "ProgramPerformer"("singerId");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_name_key" ON "Instrument"("name");

-- CreateIndex
CREATE INDEX "ProgramItemInstrument_itemId_idx" ON "ProgramItemInstrument"("itemId");

-- CreateIndex
CREATE INDEX "ProgramItemInstrument_instrumentId_idx" ON "ProgramItemInstrument"("instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramItemInstrument_itemId_instrumentId_key" ON "ProgramItemInstrument"("itemId", "instrumentId");

-- CreateIndex
CREATE INDEX "SessionCrew_sessionId_idx" ON "SessionCrew"("sessionId");

-- CreateIndex
CREATE INDEX "SessionCrew_singerId_idx" ON "SessionCrew"("singerId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionCrew_sessionId_singerId_job_key" ON "SessionCrew"("sessionId", "singerId", "job");

-- AddForeignKey
ALTER TABLE "ProgramItem" ADD CONSTRAINT "ProgramItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPerformer" ADD CONSTRAINT "ProgramPerformer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProgramItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramPerformer" ADD CONSTRAINT "ProgramPerformer_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItemInstrument" ADD CONSTRAINT "ProgramItemInstrument_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProgramItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItemInstrument" ADD CONSTRAINT "ProgramItemInstrument_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramItemInstrument" ADD CONSTRAINT "ProgramItemInstrument_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCrew" ADD CONSTRAINT "SessionCrew_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionCrew" ADD CONSTRAINT "SessionCrew_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


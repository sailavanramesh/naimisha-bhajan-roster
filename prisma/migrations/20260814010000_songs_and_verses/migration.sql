-- AlterTable
ALTER TABLE "Singer" ADD COLUMN     "canEditWords" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Song" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT,
    "tradition" TEXT,
    "composer" TEXT,
    "referenceUrl" TEXT,
    "audio" TEXT,
    "bpm" INTEGER,
    "notes" TEXT,
    "bhajanId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongVerse" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT,
    "script" TEXT,
    "roman" TEXT,
    "meaning" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongVerse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongDeity" (
    "songId" TEXT NOT NULL,
    "deityId" TEXT NOT NULL,

    CONSTRAINT "SongDeity_pkey" PRIMARY KEY ("songId","deityId")
);

-- CreateTable
CREATE TABLE "SongTag" (
    "songId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "SongTag_pkey" PRIMARY KEY ("songId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Song_title_key" ON "Song"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Song_bhajanId_key" ON "Song"("bhajanId");

-- CreateIndex
CREATE INDEX "Song_tradition_idx" ON "Song"("tradition");

-- CreateIndex
CREATE INDEX "SongVerse_songId_idx" ON "SongVerse"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "SongVerse_songId_order_key" ON "SongVerse"("songId", "order");

-- CreateIndex
CREATE INDEX "SongDeity_deityId_idx" ON "SongDeity"("deityId");

-- CreateIndex
CREATE INDEX "SongTag_tagId_idx" ON "SongTag"("tagId");

-- AddForeignKey
ALTER TABLE "ProgramItem" ADD CONSTRAINT "ProgramItem_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_bhajanId_fkey" FOREIGN KEY ("bhajanId") REFERENCES "Bhajan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongVerse" ADD CONSTRAINT "SongVerse_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongDeity" ADD CONSTRAINT "SongDeity_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongDeity" ADD CONSTRAINT "SongDeity_deityId_fkey" FOREIGN KEY ("deityId") REFERENCES "Deity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongTag" ADD CONSTRAINT "SongTag_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongTag" ADD CONSTRAINT "SongTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;


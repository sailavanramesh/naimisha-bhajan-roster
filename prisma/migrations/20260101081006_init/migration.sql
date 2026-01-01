-- CreateTable
CREATE TABLE "Singer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Singer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bhajan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "singers" TEXT,
    "meaning" TEXT,
    "lyrics" TEXT,
    "audio" TEXT,
    "deity" TEXT,
    "language" TEXT,
    "raga" TEXT,
    "beat" TEXT,
    "level" TEXT,
    "tempo" TEXT,
    "referenceGentsPitch" TEXT,
    "referenceLadiesPitch" TEXT,
    "musicNotesForFirstLine" TEXT,
    "notesRange" TEXT,
    "tutorial" TEXT,
    "sheetMusic" TEXT,
    "songTags" TEXT,
    "glossaryTerms" TEXT,
    "debugFile" TEXT,
    "video" TEXT,
    "generalComments" TEXT,
    "karaokeTracksForPractice" TEXT,
    "goldenVoice" TEXT,
    "instrumental" TEXT,
    "extra" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bhajan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSinger" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "bhajanId" TEXT,
    "slot" INTEGER,
    "bhajanTitle" TEXT,
    "festivalBhajanTitle" TEXT,
    "inputOnlyCustomBhajan" TEXT,
    "confirmedPitch" TEXT,
    "alternativeTablaPitch" TEXT,
    "recommendedPitch" TEXT,
    "raga" TEXT,
    "lyrics" TEXT,
    "meaning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionSinger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionInstrument" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "person" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchLookup" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tablaPitch" TEXT,
    "value" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchLookup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentPerson" (
    "id" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstrumentPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FestivalBhajan" (
    "id" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "bhajanId" TEXT,
    "title" TEXT NOT NULL,
    "order" INTEGER,

    CONSTRAINT "FestivalBhajan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Singer_name_key" ON "Singer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Bhajan_title_key" ON "Bhajan"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Session_date_key" ON "Session"("date");

-- CreateIndex
CREATE INDEX "SessionSinger_sessionId_idx" ON "SessionSinger"("sessionId");

-- CreateIndex
CREATE INDEX "SessionSinger_singerId_idx" ON "SessionSinger"("singerId");

-- CreateIndex
CREATE INDEX "SessionSinger_bhajanId_idx" ON "SessionSinger"("bhajanId");

-- CreateIndex
CREATE INDEX "SessionInstrument_sessionId_idx" ON "SessionInstrument"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PitchLookup_label_key" ON "PitchLookup"("label");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentPerson_instrument_person_key" ON "InstrumentPerson"("instrument", "person");

-- CreateIndex
CREATE INDEX "FestivalBhajan_singerId_idx" ON "FestivalBhajan"("singerId");

-- AddForeignKey
ALTER TABLE "SessionSinger" ADD CONSTRAINT "SessionSinger_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSinger" ADD CONSTRAINT "SessionSinger_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSinger" ADD CONSTRAINT "SessionSinger_bhajanId_fkey" FOREIGN KEY ("bhajanId") REFERENCES "Bhajan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInstrument" ADD CONSTRAINT "SessionInstrument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalBhajan" ADD CONSTRAINT "FestivalBhajan_singerId_fkey" FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FestivalBhajan" ADD CONSTRAINT "FestivalBhajan_bhajanId_fkey" FOREIGN KEY ("bhajanId") REFERENCES "Bhajan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

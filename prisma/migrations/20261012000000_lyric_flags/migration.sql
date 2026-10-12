-- Words or phrases to flag in the lyrics of a rostered bhajan.
--
-- A new table and nothing else, so it is safe to apply before the code that
-- reads it ships.
CREATE TABLE "LyricFlag" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "wholeWord" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LyricFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LyricFlag_startsOn_idx" ON "LyricFlag"("startsOn");

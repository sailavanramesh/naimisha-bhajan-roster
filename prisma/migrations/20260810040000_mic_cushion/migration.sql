-- Mic cushion colours for the sound desk.
--
-- Purely additive: one new enum and one new table. Nothing existing is
-- altered, so the 709 confirmedPitch values and every other historical column
-- are untouched by this migration.

CREATE TYPE "MicColour" AS ENUM ('blue', 'grey', 'orange', 'pink');

CREATE TABLE "MicCushion" (
    "sessionId" TEXT NOT NULL,
    "singerId" TEXT NOT NULL,
    "colour" "MicColour" NOT NULL,
    "setByName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MicCushion_pkey" PRIMARY KEY ("sessionId", "singerId")
);

CREATE INDEX "MicCushion_sessionId_idx" ON "MicCushion"("sessionId");

ALTER TABLE "MicCushion" ADD CONSTRAINT "MicCushion_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MicCushion" ADD CONSTRAINT "MicCushion_singerId_fkey"
    FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- What the harmonium players were last told about a session: a ledger, so the
-- summary goes out once, and a snapshot, so a later edit can be described as
-- the specific bhajan that moved rather than as "something changed".

-- CreateTable
CREATE TABLE "HarmoniumNotice" (
    "sessionId" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HarmoniumNotice_pkey" PRIMARY KEY ("sessionId")
);

-- AddForeignKey
ALTER TABLE "HarmoniumNotice" ADD CONSTRAINT "HarmoniumNotice_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

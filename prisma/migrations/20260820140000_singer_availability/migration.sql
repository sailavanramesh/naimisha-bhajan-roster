-- Availability, and opt-in cycle tracking.
--
-- Two new tables, nothing altered. No existing row changes meaning and no
-- column is added to Singer, so anything already selecting a singer is
-- untouched.
--
-- SingerCycle is deliberately its OWN table rather than columns on Singer: it
-- holds health information, and a `select` on Singer must not be able to reach
-- it by accident. Joining to it has to be written on purpose, and the only
-- place that does is the singer's own availability page.
CREATE TABLE "SingerUnavailability" (
  "id"        TEXT NOT NULL,
  "singerId"  TEXT NOT NULL,
  "date"      DATE NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SingerUnavailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SingerUnavailability_singerId_date_key"
  ON "SingerUnavailability"("singerId", "date");
CREATE INDEX "SingerUnavailability_date_idx" ON "SingerUnavailability"("date");

ALTER TABLE "SingerUnavailability"
  ADD CONSTRAINT "SingerUnavailability_singerId_fkey"
  FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SingerCycle" (
  "id"              TEXT NOT NULL,
  "singerId"        TEXT NOT NULL,
  "lastStart"       DATE NOT NULL,
  "cycleLengthDays" INTEGER NOT NULL DEFAULT 28,
  "durationDays"    INTEGER NOT NULL DEFAULT 4,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SingerCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SingerCycle_singerId_key" ON "SingerCycle"("singerId");

ALTER TABLE "SingerCycle"
  ADD CONSTRAINT "SingerCycle_singerId_fkey"
  FOREIGN KEY ("singerId") REFERENCES "Singer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

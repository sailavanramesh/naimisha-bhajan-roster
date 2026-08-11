-- A coordinator's decision about which tabla to tune, overriding the computed
-- rule. Keyed on (raga, Sa) so correcting it once fixes every bhajan in that
-- raga at that pitch.
--
-- Purely additive: one new table. Nothing existing is altered, so the 639
-- confirmed pitches and every other historical column are untouched.

CREATE TABLE "TablaOverride" (
    "id" TEXT NOT NULL,
    "raga" TEXT NOT NULL DEFAULT '',
    "sa" INTEGER NOT NULL,
    "note" TEXT,
    "reason" TEXT,
    "setByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TablaOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TablaOverride_raga_sa_key" ON "TablaOverride"("raga", "sa");
CREATE INDEX "TablaOverride_sa_idx" ON "TablaOverride"("sa");

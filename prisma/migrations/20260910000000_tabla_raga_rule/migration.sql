-- A raga's own preference about which DEGREE a tabla is tuned to.
--
-- Additive only. Nothing existing is touched, so the app and the schema can be
-- out of step in the harmless direction while a deploy lands.
--
-- Written by hand rather than taken from `prisma migrate diff`, which also
-- wanted to DROP INDEX "SessionChannel_withSingerId_idx" — pre-existing drift
-- between the migrations and the schema that has nothing to do with this
-- change and must not ride along inside it.
CREATE TABLE "TablaRagaRule" (
    "id" TEXT NOT NULL,
    "raga" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "reason" TEXT,
    "setByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TablaRagaRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TablaRagaRule_raga_key" ON "TablaRagaRule"("raga");

-- Festival mode: constrain a whole session to one deity (SPEC 4.G).
-- Additive and nullable, so it is safe against the seeded database.

-- AlterTable
ALTER TABLE "SessionTemplate" ADD COLUMN     "singleDeity" TEXT;


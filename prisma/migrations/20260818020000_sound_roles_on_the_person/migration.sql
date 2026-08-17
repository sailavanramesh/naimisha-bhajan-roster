-- The sound jobs move from the NIGHT to the PERSON.
--
-- They were SessionCrew — a row per person per session, allocated under "Who is
-- running it" on every programme — plus a vaguer standing grant, canRunSound.
-- Sailavan, 2026-08-18: "if we add the roles of mic coordinator and sound
-- engineer at the admin level we can remove who is running it from all views."
--
-- NOBODY LOSES ACCESS. Both old sources are carried into the new columns before
-- anything is dropped: anyone ever crewed on a session, and anyone holding the
-- old grant, comes out the other side holding the matching role.

-- AlterTable
ALTER TABLE "Singer" ADD COLUMN "soundEngineer" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Singer" ADD COLUMN "micCoordinator" BOOLEAN NOT NULL DEFAULT false;

-- Carry the per-session crew forward.
UPDATE "Singer" s
SET "soundEngineer" = true
WHERE EXISTS (
  SELECT 1 FROM "SessionCrew" c
  WHERE c."singerId" = s."id" AND c."job" = 'soundEngineer'
);

UPDATE "Singer" s
SET "micCoordinator" = true
WHERE EXISTS (
  SELECT 1 FROM "SessionCrew" c
  WHERE c."singerId" = s."id" AND c."job" = 'micCoordinator'
);

-- The old standing grant said "this person runs the sound" without saying which
-- job. Sound engineer is the closer of the two: it is the one that reads the
-- desk, which is what the grant unlocked.
UPDATE "Singer" SET "soundEngineer" = true WHERE "canRunSound" = true;

-- DropTable
DROP TABLE "SessionCrew";

-- DropEnum
DROP TYPE "SessionJob";

-- AlterTable
ALTER TABLE "Singer" DROP COLUMN "canRunSound";

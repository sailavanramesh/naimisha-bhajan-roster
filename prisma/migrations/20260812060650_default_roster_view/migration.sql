-- CreateEnum
CREATE TYPE "RosterView" AS ENUM ('calendar', 'list');

-- AlterTable
ALTER TABLE "Singer" ADD COLUMN     "defaultRosterView" "RosterView";

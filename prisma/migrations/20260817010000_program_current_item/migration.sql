-- Which item in the running order a programme is ON, shared across every device
-- looking at it. Null until somebody starts, which reads as "we have not begun".

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "currentItemPosition" INTEGER;

-- The coordinators' "a flagged word is in tonight's lyrics" notice, recorded
-- in SessionNotice like every other kind so nobody is told twice.
--
-- Adds an enum value and nothing else, so it is safe to apply before the code
-- that writes it ships.
ALTER TYPE "NoticeKind" ADD VALUE 'lyric_flag';

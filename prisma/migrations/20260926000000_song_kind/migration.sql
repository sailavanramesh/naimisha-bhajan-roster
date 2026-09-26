-- Songs and chants in one catalogue, told apart by a column.
--
-- Chants, stotras and ashtottaras are recited rather than sung, but they are the
-- same SHAPE as a song: a title and words in up to three layers. So they live in
-- "Song" with a kind, not in a second table — see the note on the enum in
-- schema.prisma.
--
-- NOT NULL DEFAULT 'song'. Every existing row is a song and stays one, so this
-- is safe to apply before the code that reads it ships.
CREATE TYPE "SongKind" AS ENUM ('song', 'chant');

ALTER TABLE "Song"
  ADD COLUMN "kind" "SongKind" NOT NULL DEFAULT 'song';

-- The catalogue is always read one kind at a time.
CREATE INDEX "Song_kind_idx" ON "Song"("kind");

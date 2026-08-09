/**
 * scripts/backfillText.ts — restore line breaks in lyrics, meaning and notes.
 *
 * The original seed passed these through a whitespace-collapsing helper meant
 * for names, which flattened 3,593 of 3,613 lyric cells into a single
 * paragraph. The line breaks were never lost from data/roster.xlsx, only from
 * the import, so they can be restored.
 *
 * SAFE: updates only long-text columns on Bhajan, matched by title. It cannot
 * touch SessionSlot, so no confirmedPitch is at risk. Rows whose stored value
 * already matches are skipped.
 *
 *   npm run db:backfill-text -- --dry-run
 *   npm run db:backfill-text
 */
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');

const FIELDS = [
  ['lyrics', 'lyrics'],
  ['meaning', 'meaning'],
  ['musicNotesForFirstLine', 'music_notes_for_first_line'],
  ['glossaryTerms', 'glossary_terms'],
  ['generalComments', 'general_comments'],
  ['karaokeTracksForPractice', 'karaoke_tracks_for_practice'],
] as const;

const text = (v: unknown): string | null => {
  const s = String(v ?? '').replace(/\r\n?/g, '\n').trim();
  return s === '' ? null : s;
};
const norm = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');

async function main() {
  const file = path.resolve(process.cwd(), process.env.XLSX_PATH || 'data/roster.xlsx');
  if (!fs.existsSync(file)) throw new Error(`XLSX not found: ${file}`);
  const wb = XLSX.readFile(file, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets['Bhajan Masterlist'], { defval: null },
  );

  let checked = 0, updated = 0;
  const counts = new Map<string, number>();

  for (const r of rows) {
    const title = norm(r['title']);
    if (!title) continue;
    const existing = await prisma.bhajan.findUnique({
      where: { title },
      select: Object.fromEntries([['id', true], ...FIELDS.map(([f]) => [f, true])]) as never,
    });
    if (!existing) continue;
    checked++;

    const data: Record<string, string | null> = {};
    for (const [field, column] of FIELDS) {
      const want = text(r[column]);
      const have = (existing as Record<string, string | null>)[field];
      if (want !== null && want !== have) {
        data[field] = want;
        counts.set(field, (counts.get(field) ?? 0) + 1);
      }
    }
    if (Object.keys(data).length === 0) continue;
    updated++;
    if (!DRY) {
      await prisma.bhajan.update({ where: { id: (existing as { id: string }).id }, data });
    }
  }

  console.log(`${DRY ? 'Would update' : 'Updated'} ${updated} of ${checked} bhajans.`);
  for (const [f, n] of [...counts.entries()].sort()) console.log(`  ${f}: ${n}`);
}

main()
  .catch((e) => { console.error('\nBackfill failed:', e instanceof Error ? e.message : e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

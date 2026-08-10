/**
 * scripts/seedFromXlsx.ts — initial import from data/roster.xlsx.
 *
 * `data/roster.xlsx` is the source of truth for the INITIAL import only. After
 * seeding, the database is authoritative and this script must never be used to
 * "refresh" it. Never write back to the xlsx.
 *
 * Safety: refuses to run against a database that already holds session slots
 * unless --force is passed. Even with --force it only ever inserts or updates;
 * it never deletes, truncates or resets. The 709 confirmedPitch values exist
 * nowhere else.
 *
 *   npm run db:seed
 *   npm run db:seed -- --force     # re-run over an existing database
 *   npm run db:seed -- --dry-run   # parse and report, write nothing
 */

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Gender, Series, RepertoireKind } from '@prisma/client';
import * as XLSX from 'xlsx';
import { parsePitchLabel, saOf } from '../lib/pitch';

const prisma = new PrismaClient();

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const CHUNK = 500;

/** Sheets that are scratch or superseded. See CLAUDE.md data dictionary. */
const IGNORED_SHEETS = ['Recent Bhajans', 'Dates', 'Sheet38'];

const INSTRUMENT_COLUMNS = [
  'Harmonium',
  'Chorus Mic',
  'Tabla',
  'Cymbals (Male)',
  'Cymbals (Female)',
  'Tambourine',
  'Ghanjira (small)',
] as const;

/** Lookup-table columns holding the eligible people per instrument. */
const INSTRUMENT_ELIGIBILITY: ReadonlyArray<readonly [number, string]> = [
  [10, 'Harmonium'],
  [11, 'Tabla'],
  [12, 'Cymbals'],
  [13, 'Tambourine'],
  [14, 'Ghanjira (small)'],
];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Trim and collapse internal whitespace. Fixes `"Prithvi "` on import. */
function norm(v: unknown): string {
  return String(v ?? '').trim().replace(/\s+/g, ' ');
}

/** Same as norm() but returns null for empty, for nullable columns. */
function nz(v: unknown): string | null {
  const s = norm(v);
  return s === '' ? null : s;
}

/**
 * For MULTI-LINE text: lyrics, meaning, notes.
 *
 * `norm()` collapses every run of whitespace to a single space, which is right
 * for a singer's name and catastrophic for a song. Using it on lyrics flattened
 * 3,593 of 3,613 verses into one unreadable paragraph. This only trims the ends
 * and normalises line endings.
 */
function text(v: unknown): string | null {
  const s = String(v ?? '').replace(/\r\n?/g, '\n').trim();
  return s === '' ? null : s;
}

const melbourneParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Melbourne',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Session dates are dates, not timestamps.
 *
 * The export stores each session as the instant of local midnight in Melbourne
 * (e.g. `2025-03-17T13:00:00Z` is 18 March, AEDT being UTC+11). Reading the
 * UTC calendar date would shift every session back a day, so the instant is
 * resolved in Australia/Melbourne and then stored as UTC midnight, which is
 * how Postgres `DATE` round-trips through Prisma.
 */
function toSessionDate(value: unknown): Date | null {
  let instant: Date | null = null;

  if (value instanceof Date) {
    instant = value;
  } else if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  } else if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) instant = d;
  }

  if (!instant || Number.isNaN(instant.getTime())) return null;
  const [y, m, d] = melbourneParts.format(instant).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Deity values are comma-delimited; individual values may contain spaces
 *  (`Sarva Dharma`), so this splits on commas only. */
function splitDeities(v: unknown): string[] {
  return norm(v).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Tags are delimited by commas AND spaces (`lead-music karaoke sheet-music`). */
function splitTags(v: unknown): string[] {
  return norm(v).split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type Sheet = Record<string, unknown>;

/**
 * Read a sheet as objects, keyed by TRIMMED header names.
 *
 * The `Singer Roster` date column is headed `"  "` (two spaces) in the current
 * export — the previous seed looked it up as `"."` and would have imported no
 * dates at all. Headers are trimmed here, and the caller resolves the date
 * column positionally via `firstColumnKey`.
 */
function readSheet(wb: XLSX.WorkBook, name: string): { rows: Sheet[]; firstColumnKey: string } {
  const ws = wb.Sheets[name];
  if (!ws) return { rows: [], firstColumnKey: '' };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const rawHeader = (matrix[0] ?? []) as unknown[];
  const header = rawHeader.map((h, i) => {
    const t = norm(h);
    return t === '' ? `__col${i}` : t;
  });
  const rows: Sheet[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    if (row.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;
    const obj: Sheet = {};
    header.forEach((h, i) => { obj[h] = row[i] ?? null; });
    rows.push(obj);
  }
  return { rows, firstColumnKey: header[0] ?? '' };
}

/** Column-per-singer sheets (`Festival Bhajans`, `Singer Bhajan List`). */
function readColumnwise(wb: XLSX.WorkBook, name: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const ws = wb.Sheets[name];
  if (!ws) return out;
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const header = (matrix[0] ?? []) as unknown[];
  for (let c = 0; c < header.length; c++) {
    const singer = norm(header[c]);
    if (!singer) continue;
    const titles: string[] = [];
    for (let r = 1; r < matrix.length; r++) {
      const t = norm(matrix[r]?.[c]);
      if (t) titles.push(t);
    }
    if (titles.length) out.set(singer, titles);
  }
  return out;
}

const warnings: string[] = [];
function warn(message: string) {
  warnings.push(message);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const xlsxPath = process.env.XLSX_PATH || 'data/roster.xlsx';
  const abs = path.resolve(process.cwd(), xlsxPath);
  if (!fs.existsSync(abs)) throw new Error(`XLSX not found: ${abs}`);

  const existingSlots = await prisma.sessionSlot.count();
  if (existingSlots > 0 && !FORCE && !DRY_RUN) {
    throw new Error(
      `Refusing to seed: the database already holds ${existingSlots} session slots.\n` +
      `This script is an initial import, not a refresh. The confirmedPitch values\n` +
      `in those rows exist nowhere else. Re-run with --force only if you are sure;\n` +
      `it will upsert, never delete.`,
    );
  }

  const wb = XLSX.readFile(abs, { cellDates: true });
  console.log(`Workbook: ${path.relative(process.cwd(), abs)}`);
  console.log(`Sheets:   ${wb.SheetNames.join(', ')}`);
  const ignored = wb.SheetNames.filter((n) => IGNORED_SHEETS.includes(n));
  if (ignored.length) console.log(`Ignoring: ${ignored.join(', ')} (scratch / derivable)`);
  if (DRY_RUN) console.log('\n*** DRY RUN — nothing will be written ***');

  // -- 1. Lookup tables: singers, pitch labels, instrument eligibility --------
  const lookup = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Lookup tables'], {
    header: 1, raw: true, defval: null,
  });

  const singerGender = new Map<string, Gender | null>();
  for (let i = 1; i < lookup.length; i++) {
    const name = norm(lookup[i]?.[0]);
    if (!name) break;
    const raw = norm(lookup[i]?.[1]);
    let gender: Gender | null = null;
    if (raw === 'Gents') gender = Gender.Gents;
    else if (raw === 'Ladies') gender = Gender.Ladies;
    else if (raw) warn(`Unknown gender "${raw}" for singer "${name}" — stored as null`);
    singerGender.set(name, gender);
  }
  console.log(`\nSingers:      ${singerGender.size}`);

  const pitchRows: { label: string; step: number; series: Series; note: string; semitone: number; tablaPitch: string | null; value: number | null }[] = [];
  for (let i = 1; i < lookup.length; i++) {
    const label = norm(lookup[i]?.[3]);
    if (!label) break;
    const parsed = parsePitchLabel(label);
    if (!parsed) { warn(`Unparseable pitch label "${label}" — skipped`); continue; }
    const tabla = nz(lookup[i]?.[4]);
    const value = typeof lookup[i]?.[5] === 'number' ? (lookup[i][5] as number) : null;
    // Cross-check the source against the rule: tabla is always Sa + 7.
    const expected = (parsed.semitone + 7) % 12;
    if (tabla && saOf(`/ ${tabla}`) !== expected) {
      warn(`Pitch label "${label}": recorded tabla "${tabla}" is not Sa+7 — kept as recorded`);
    }
    pitchRows.push({
      label, step: parsed.step, series: parsed.series as Series, note: parsed.note,
      semitone: parsed.semitone, tablaPitch: tabla, value,
    });
  }
  console.log(`Pitch labels: ${pitchRows.length}`);

  const eligibility: { instrument: string; person: string }[] = [];
  for (const [col, instrument] of INSTRUMENT_ELIGIBILITY) {
    for (let i = 1; i < lookup.length; i++) {
      const person = norm(lookup[i]?.[col]);
      if (!person) break;
      eligibility.push({ instrument, person });
    }
  }

  // -- 2. Bhajan Masterlist --------------------------------------------------
  const mlRows = XLSX.utils.sheet_to_json<Sheet>(wb.Sheets['Bhajan Masterlist'], { defval: null });
  const bhajanByTitle = new Map<string, Sheet>();
  let duplicateTitles = 0;
  for (const r of mlRows) {
    const title = norm(r['title']);
    if (!title) continue;
    const first = bhajanByTitle.get(title);
    if (first) {
      duplicateTitles++;
      // Title is the natural key, so only one row can survive. Keep the first
      // in sheet order and say loudly when the loser disagreed about pitch —
      // these are the rows where "which duplicate wins" changes the answer.
      const gDiff = norm(first['reference_gents_pitch']) !== norm(r['reference_gents_pitch']);
      const lDiff = norm(first['reference_ladies_pitch']) !== norm(r['reference_ladies_pitch']);
      if (gDiff || lDiff) {
        warn(
          `CONFLICTING duplicate masterlist title "${title}" — keeping the first row. ` +
          `Gents "${norm(first['reference_gents_pitch'])}" vs "${norm(r['reference_gents_pitch'])}"; ` +
          `Ladies "${norm(first['reference_ladies_pitch'])}" vs "${norm(r['reference_ladies_pitch'])}". ` +
          `Reference pitch for this bhajan depends on which row wins.`,
        );
      } else {
        warn(`Duplicate masterlist title "${title}" — identical reference pitches, first wins`);
      }
      continue;
    }
    bhajanByTitle.set(title, r);
  }
  console.log(`Bhajans:      ${bhajanByTitle.size} unique (from ${mlRows.length} rows, ${duplicateTitles} duplicate titles collapsed)`);

  const deityNames = new Set<string>();
  const tagNames = new Set<string>();
  for (const r of bhajanByTitle.values()) {
    splitDeities(r['deity']).forEach((d) => deityNames.add(d));
    splitTags(r['song_tags']).forEach((t) => tagNames.add(t));
  }
  console.log(`Deities:      ${deityNames.size}`);
  console.log(`Tags:         ${tagNames.size}`);

  // -- 3. Singer Roster ------------------------------------------------------
  const { rows: rosterRows, firstColumnKey: dateKey } = readSheet(wb, 'Singer Roster');
  console.log(`Roster rows:  ${rosterRows.length} (date column key: "${dateKey}")`);

  type SlotDraft = {
    date: Date; singer: string; position: number;
    bhajanTitle: string | null; festivalBhajanTitle: string | null; inputOnlyCustomBhajan: string | null;
    confirmedPitch: string | null; historicalRecommendedPitch: string | null; alternativeTablaPitch: string | null;
  };
  const slotDrafts: SlotDraft[] = [];
  const positionBySession = new Map<string, number>();
  const sessionDates = new Map<string, Date>();
  let skippedNoDate = 0, skippedNoSinger = 0;
  const unmatchedTitles: string[] = [];

  for (const r of rosterRows) {
    const singer = norm(r['Singer']);
    if (!singer) { skippedNoSinger++; continue; }
    const date = toSessionDate(r[dateKey]);
    if (!date) { skippedNoDate++; warn(`Roster row for "${singer}" has no usable date — skipped`); continue; }

    const key = date.toISOString().slice(0, 10);
    sessionDates.set(key, date);
    const position = (positionBySession.get(key) ?? 0) + 1;
    positionBySession.set(key, position);

    if (!singerGender.has(singer)) {
      warn(`Roster names singer "${singer}" who is absent from the Lookup tables — created without gender`);
      singerGender.set(singer, null);
    }

    const bhajanTitle = nz(r['Bhajan']);
    if (bhajanTitle && !bhajanByTitle.has(bhajanTitle)) unmatchedTitles.push(bhajanTitle);

    slotDrafts.push({
      date, singer, position,
      bhajanTitle,
      festivalBhajanTitle: nz(r['Festival Bhajan']),
      inputOnlyCustomBhajan: nz(r['Input only IF Bhajan (NOT in database)']),
      confirmedPitch: nz(r['Confirmed Pitch']),
      historicalRecommendedPitch: nz(r['Recommended Pitch as Sai Rythms']),
      alternativeTablaPitch: nz(r['Alternative Tabla Pitch']),
    });
  }
  console.log(`Slots:        ${slotDrafts.length} across ${sessionDates.size} sessions`);
  if (skippedNoSinger) console.log(`              ${skippedNoSinger} rows skipped (no singer)`);
  if (skippedNoDate) console.log(`              ${skippedNoDate} rows skipped (no date)`);

  const dates = [...sessionDates.values()].sort((a, b) => a.getTime() - b.getTime());
  if (dates.length) {
    console.log(`Date range:   ${dates[0].toISOString().slice(0, 10)} → ${dates[dates.length - 1].toISOString().slice(0, 10)}`);
  }

  // The known data-quality issue: one historical row disagrees with the
  // masterlist. Log it, do not fail. (CLAUDE.md, "Known data quality issues".)
  let bothKnown = 0, disagreements = 0;
  for (const s of slotDrafts) {
    if (!s.historicalRecommendedPitch || !s.bhajanTitle) continue;
    const bh = bhajanByTitle.get(s.bhajanTitle);
    if (!bh) continue;
    const gender = singerGender.get(s.singer);
    const reference = norm(gender === Gender.Ladies ? bh['reference_ladies_pitch'] : bh['reference_gents_pitch']);
    if (!reference) continue;
    bothKnown++;
    if (reference !== s.historicalRecommendedPitch) {
      disagreements++;
      warn(`Pitch disagreement: ${s.singer} / "${s.bhajanTitle}" — sheet "${s.historicalRecommendedPitch}" vs masterlist "${reference}"`);
    }
  }
  console.log(`Pitch check:  ${bothKnown} rows have both a sheet recommendation and a masterlist reference; ${disagreements} disagree`);

  if (unmatchedTitles.length) {
    const distinct = [...new Set(unmatchedTitles)];
    console.log(`Unmatched:    ${unmatchedTitles.length} roster rows name ${distinct.length} titles absent from the masterlist (kept as free text)`);
    distinct.forEach((t) => warn(`Roster title not in masterlist: "${t}"`));
  }

  // -- 4. Instrumentalist Roster --------------------------------------------
  const { rows: instRows } = readSheet(wb, 'Instrumentalist Roster');
  const instrumentDrafts: { date: Date; instrument: string; person: string }[] = [];
  const singerSessionCount = sessionDates.size;
  const instrumentOnlyDates = new Set<string>();
  for (const r of instRows) {
    const date = toSessionDate(r['Date']);
    if (!date) continue;
    const key = date.toISOString().slice(0, 10);
    const assignments = INSTRUMENT_COLUMNS.map((i) => nz(r[i])).filter((p): p is string => p !== null);
    if (assignments.length === 0) continue;
    // A date with instrumentalists but no singers is still a real session.
    // Keeping it costs nothing and dropping it would silently lose roster
    // history, so these are created too.
    if (!sessionDates.has(key)) instrumentOnlyDates.add(key);
    sessionDates.set(key, date);
    for (const inst of INSTRUMENT_COLUMNS) {
      const person = nz(r[inst]);
      if (person) instrumentDrafts.push({ date, instrument: inst, person });
    }
  }
  console.log(`Instruments:  ${instrumentDrafts.length} assignments`);
  console.log(`Sessions:     ${sessionDates.size} total — ${singerSessionCount} with singer slots, ${instrumentOnlyDates.size} with instrumentalists only`);
  if (instrumentOnlyDates.size) {
    warn(`${instrumentOnlyDates.size} sessions have instrumentalists but no singer slots: ${[...instrumentOnlyDates].sort().join(', ')}`);
  }

  // -- 5. Repertoire ---------------------------------------------------------
  const festival = readColumnwise(wb, 'Festival Bhajans');
  const known = readColumnwise(wb, 'Singer Bhajan List - by singer');
  const repertoireDrafts: { singer: string; title: string; kind: RepertoireKind; order: number }[] = [];
  for (const [map, kind] of [[festival, RepertoireKind.festival], [known, RepertoireKind.known]] as const) {
    for (const [singer, titles] of map) {
      if (!singerGender.has(singer)) { warn(`Repertoire column "${singer}" is not a known singer — skipped`); continue; }
      const seen = new Set<string>();
      titles.forEach((title, i) => {
        if (seen.has(title)) return;
        seen.add(title);
        repertoireDrafts.push({ singer, title, kind, order: i + 1 });
      });
    }
  }
  console.log(`Repertoire:   ${repertoireDrafts.length} entries (${festival.size} festival columns, ${known.size} known columns)`);

  if (DRY_RUN) {
    printWarnings();
    console.log('\nDry run complete. Nothing written.');
    return;
  }

  // -- write -----------------------------------------------------------------
  console.log('\nWriting…');

  for (const [name, gender] of singerGender) {
    await prisma.singer.upsert({
      where: { name },
      create: { name, gender: gender ?? undefined },
      update: { gender: gender ?? undefined },
    });
  }
  const singerIds = new Map((await prisma.singer.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id]));
  console.log(`  singers      ${singerIds.size}`);

  for (const p of pitchRows) {
    await prisma.pitchLabel.upsert({ where: { label: p.label }, create: p, update: p });
  }
  console.log(`  pitchLabels  ${pitchRows.length}`);

  for (const e of eligibility) {
    await prisma.instrumentPerson.upsert({
      where: { instrument_person: { instrument: e.instrument, person: e.person } },
      create: e, update: {},
    });
  }
  console.log(`  eligibility  ${eligibility.length}`);

  await prisma.deity.createMany({ data: [...deityNames].map((name) => ({ name })), skipDuplicates: true });
  await prisma.tag.createMany({ data: [...tagNames].map((name) => ({ name })), skipDuplicates: true });
  const deityIds = new Map((await prisma.deity.findMany({ select: { id: true, name: true } })).map((d) => [d.name, d.id]));
  const tagIds = new Map((await prisma.tag.findMany({ select: { id: true, name: true } })).map((t) => [t.name, t.id]));
  console.log(`  deities      ${deityIds.size}`);
  console.log(`  tags         ${tagIds.size}`);

  const bhajanData = [...bhajanByTitle.entries()].map(([title, r]) => ({
    title,
    url: nz(r['url']), singers: nz(r['singers']), meaning: text(r['meaning']), lyrics: text(r['lyrics']),
    audio: nz(r['audio']), deity: nz(r['deity']), language: nz(r['language']), raga: nz(r['raga']),
    beat: nz(r['beat']), level: nz(r['level']), tempo: nz(r['tempo']),
    referenceGentsPitch: nz(r['reference_gents_pitch']), referenceLadiesPitch: nz(r['reference_ladies_pitch']),
    musicNotesForFirstLine: text(r['music_notes_for_first_line']), notesRange: nz(r['notes_range']),
    tutorial: nz(r['tutorial']), sheetMusic: nz(r['sheet_music']), songTags: nz(r['song_tags']),
    glossaryTerms: text(r['glossary_terms']), debugFile: nz(r['debug_file']), video: nz(r['video']),
    generalComments: text(r['general_comments']), karaokeTracksForPractice: text(r['karaoke_tracks_for_practice']),
    goldenVoice: nz(r['golden_voice']), instrumental: nz(r['instrumental']), extra: nz(r['Column 1']),
  }));
  for (const part of chunk(bhajanData, CHUNK)) {
    await prisma.bhajan.createMany({ data: part, skipDuplicates: true });
  }
  if (FORCE) {
    for (const b of bhajanData) {
      const { title, ...rest } = b;
      await prisma.bhajan.update({ where: { title }, data: rest });
    }
  }
  const bhajanIds = new Map((await prisma.bhajan.findMany({ select: { id: true, title: true } })).map((b) => [b.title, b.id]));
  console.log(`  bhajans      ${bhajanIds.size}`);

  const bhajanDeityRows: { bhajanId: string; deityId: string }[] = [];
  const bhajanTagRows: { bhajanId: string; tagId: string }[] = [];
  for (const [title, r] of bhajanByTitle) {
    const bid = bhajanIds.get(title);
    if (!bid) continue;
    for (const d of new Set(splitDeities(r['deity']))) {
      const did = deityIds.get(d); if (did) bhajanDeityRows.push({ bhajanId: bid, deityId: did });
    }
    for (const t of new Set(splitTags(r['song_tags']))) {
      const tid = tagIds.get(t); if (tid) bhajanTagRows.push({ bhajanId: bid, tagId: tid });
    }
  }
  for (const part of chunk(bhajanDeityRows, CHUNK)) await prisma.bhajanDeity.createMany({ data: part, skipDuplicates: true });
  for (const part of chunk(bhajanTagRows, CHUNK)) await prisma.bhajanTag.createMany({ data: part, skipDuplicates: true });
  console.log(`  bhajanDeity  ${bhajanDeityRows.length}`);
  console.log(`  bhajanTag    ${bhajanTagRows.length}`);

  await prisma.session.createMany({
    data: [...sessionDates.values()].map((date) => ({ date })),
    skipDuplicates: true,
  });
  const sessionIds = new Map(
    (await prisma.session.findMany({ select: { id: true, date: true } }))
      .map((s) => [s.date.toISOString().slice(0, 10), s.id]),
  );
  console.log(`  sessions     ${sessionIds.size}`);

  const slotRows = slotDrafts.map((s) => ({
    sessionId: sessionIds.get(s.date.toISOString().slice(0, 10))!,
    singerId: singerIds.get(s.singer)!,
    bhajanId: s.bhajanTitle ? bhajanIds.get(s.bhajanTitle) ?? null : null,
    position: s.position,
    bhajanTitle: s.bhajanTitle,
    festivalBhajanTitle: s.festivalBhajanTitle,
    inputOnlyCustomBhajan: s.inputOnlyCustomBhajan,
    confirmedPitch: s.confirmedPitch,
    historicalRecommendedPitch: s.historicalRecommendedPitch,
    alternativeTablaPitch: s.alternativeTablaPitch,
  })).filter((s) => s.sessionId && s.singerId);
  for (const part of chunk(slotRows, CHUNK)) {
    await prisma.sessionSlot.createMany({ data: part, skipDuplicates: true });
  }
  console.log(`  slots        ${slotRows.length}`);

  const instRowsOut = instrumentDrafts.map((i) => ({
    sessionId: sessionIds.get(i.date.toISOString().slice(0, 10))!,
    instrument: i.instrument,
    person: i.person,
  })).filter((i) => i.sessionId);
  const existingInstruments = await prisma.sessionInstrument.count();
  if (existingInstruments === 0) {
    for (const part of chunk(instRowsOut, CHUNK)) await prisma.sessionInstrument.createMany({ data: part });
  } else {
    console.log(`  instruments  skipped (${existingInstruments} already present; no natural key to upsert on)`);
  }
  console.log(`  instruments  ${existingInstruments === 0 ? instRowsOut.length : 0}`);

  const repRows = repertoireDrafts.map((r) => ({
    singerId: singerIds.get(r.singer)!,
    bhajanId: bhajanIds.get(r.title) ?? null,
    title: r.title,
    kind: r.kind,
    order: r.order,
  })).filter((r) => r.singerId);
  for (const part of chunk(repRows, CHUNK)) {
    await prisma.singerRepertoire.createMany({ data: part, skipDuplicates: true });
  }
  const repResolved = repRows.filter((r) => r.bhajanId).length;
  console.log(`  repertoire   ${repRows.length} (${repResolved} resolved to a masterlist bhajan)`);

  printWarnings();
  console.log('\nDone.');
}

function printWarnings() {
  if (!warnings.length) { console.log('\nNo warnings.'); return; }
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ! ${w}`);
}

main()
  .catch((e) => {
    console.error('\nSeed failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

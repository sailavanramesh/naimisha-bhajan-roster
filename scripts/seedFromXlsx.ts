import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function toDateOnly(d: any): Date | null {
  if (!d) return null;
  if (d instanceof Date) {
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  // Excel date number
  if (typeof d === "number") {
    const dt = XLSX.SSF.parse_date_code(d);
    if (!dt) return null;
    return new Date(Date.UTC(dt.y, dt.m - 1, dt.d));
  }
  // string
  const parsed = new Date(d);
  if (!Number.isNaN(parsed.getTime())) return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
  return null;
}

async function upsertSinger(name: string, gender?: string | null) {
  return prisma.singer.upsert({
    where: { name },
    create: { name, gender: gender ?? undefined },
    update: { gender: gender ?? undefined },
  });
}

async function main() {
  const xlsxPath = process.env.XLSX_PATH || "data/roster.xlsx";
  const abs = path.resolve(process.cwd(), xlsxPath);
  if (!fs.existsSync(abs)) throw new Error(`XLSX not found: ${abs}`);

  const wb = XLSX.readFile(abs, { cellDates: true });
  const sheetNames = wb.SheetNames;

  console.log("Sheets:", sheetNames.join(", "));

  // 1) Lookup tables: Singers + Gender, Pitches, Instrument people
  if (sheetNames.includes("Lookup tables")) {
    const ws = wb.Sheets["Lookup tables"];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    // Singers list in columns A-B starting row 2 until blank
    for (let i = 1; i < rows.length; i++) {
      const name = rows[i]?.[0];
      const gender = rows[i]?.[1];
      if (!name) break;
      await upsertSinger(String(name).trim(), gender ? String(gender).trim() : null);
    }

    // Pitch lookup in columns D-F starting row 2 until blank
    for (let i = 1; i < rows.length; i++) {
      const label = rows[i]?.[3];
      const tabla = rows[i]?.[4];
      const val = rows[i]?.[5];
      if (!label) break;
      await prisma.pitchLookup.upsert({
        where: { label: String(label).trim() },
        create: {
          label: String(label).trim(),
          tablaPitch: tabla ? String(tabla).trim() : undefined,
          value: typeof val === "number" ? val : undefined,
        },
        update: {
          tablaPitch: tabla ? String(tabla).trim() : undefined,
          value: typeof val === "number" ? val : undefined,
        },
      });
    }

    // Instrument people list headers in columns K-O (11-15)
    const instruments = [
      { col: 10, name: "Harmonium" },
      { col: 11, name: "Tabla" },
      { col: 12, name: "Cymbals" },
      { col: 13, name: "Tambourine" },
      { col: 14, name: "Ghanjira (small)" },
    ];
    for (const inst of instruments) {
      for (let i = 1; i < rows.length; i++) {
        const person = rows[i]?.[inst.col];
        if (!person) break;
        await prisma.instrumentPerson.upsert({
          where: { instrument_person: { instrument: inst.name, person: String(person).trim() } } as any,
          create: { instrument: inst.name, person: String(person).trim() },
          update: {},
        });
      }
    }
  }

  // 2) Bhajan Masterlist
  if (sheetNames.includes("Bhajan Masterlist")) {
    const ws = wb.Sheets["Bhajan Masterlist"];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[];
    console.log("Bhajans:", rows.length);
    for (const r of rows) {
      const title = r["title"];
      if (!title) continue;
      await prisma.bhajan.upsert({
        where: { title: String(title) },
        create: {
          title: String(title),
          url: r["url"],
          singers: r["singers"],
          meaning: r["meaning"],
          lyrics: r["lyrics"],
          audio: r["audio"],
          deity: r["deity"],
          language: r["language"],
          raga: r["raga"],
          beat: r["beat"],
          level: r["level"],
          tempo: r["tempo"],
          referenceGentsPitch: r["reference_gents_pitch"],
          referenceLadiesPitch: r["reference_ladies_pitch"],
          musicNotesForFirstLine: r["music_notes_for_first_line"],
          notesRange: r["notes_range"],
          tutorial: r["tutorial"],
          sheetMusic: r["sheet_music"],
          songTags: r["song_tags"],
          glossaryTerms: r["glossary_terms"],
          debugFile: r["debug_file"],
          video: r["video"],
          generalComments: r["general_comments"],
          karaokeTracksForPractice: r["karaoke_tracks_for_practice"],
          goldenVoice: r["golden_voice"],
          instrumental: r["instrumental"],
          extra: r["Column 1"],
        },
        update: {
          url: r["url"],
          singers: r["singers"],
          meaning: r["meaning"],
          lyrics: r["lyrics"],
          audio: r["audio"],
          deity: r["deity"],
          language: r["language"],
          raga: r["raga"],
          beat: r["beat"],
          level: r["level"],
          tempo: r["tempo"],
          referenceGentsPitch: r["reference_gents_pitch"],
          referenceLadiesPitch: r["reference_ladies_pitch"],
          musicNotesForFirstLine: r["music_notes_for_first_line"],
          notesRange: r["notes_range"],
          tutorial: r["tutorial"],
          sheetMusic: r["sheet_music"],
          songTags: r["song_tags"],
          glossaryTerms: r["glossary_terms"],
          debugFile: r["debug_file"],
          video: r["video"],
          generalComments: r["general_comments"],
          karaokeTracksForPractice: r["karaoke_tracks_for_practice"],
          goldenVoice: r["golden_voice"],
          instrumental: r["instrumental"],
          extra: r["Column 1"],
        },
      });
    }
  }

  // Helper: ensure session by date
  async function getOrCreateSession(d: Date) {
    return prisma.session.upsert({
      where: { date: d },
      create: { date: d },
      update: {},
    });
  }

  // 3) Singer Roster
  if (sheetNames.includes("Singer Roster")) {
    const ws = wb.Sheets["Singer Roster"];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[];
    console.log("Singer roster rows:", rows.length);

    for (const r of rows) {
      const d = toDateOnly(r["."]);
      const singerName = r["Singer"];
      if (!d || !singerName) continue;

      const singer = await upsertSinger(String(singerName).trim(), null);
      const session = await getOrCreateSession(d);

      const bhajanTitle = r["Bhajan"] ? String(r["Bhajan"]).trim() : null;
      const festivalBhajanTitle = r["Festival Bhajan"] ? String(r["Festival Bhajan"]).trim() : null;

      const bhajan = bhajanTitle
        ? await prisma.bhajan.findUnique({ where: { title: bhajanTitle } })
        : null;

      await prisma.sessionSinger.create({
        data: {
          sessionId: session.id,
          singerId: singer.id,
          bhajanId: bhajan?.id,
          bhajanTitle,
          festivalBhajanTitle,
          inputOnlyCustomBhajan: r["Input only IF Bhajan (NOT in database)"] ? String(r["Input only IF Bhajan (NOT in database)"]).trim() : null,
          confirmedPitch: r["Confirmed Pitch"] ? String(r["Confirmed Pitch"]).trim() : null,
          alternativeTablaPitch: r["Alternative Tabla Pitch"] ? String(r["Alternative Tabla Pitch"]).trim() : null,
          recommendedPitch: r["Recommended Pitch as Sai Rythms"] ? String(r["Recommended Pitch as Sai Rythms"]).trim() : null,
          raga: r["Raga"] ? String(r["Raga"]).trim() : null,
          lyrics: r["Lyrics"] ? String(r["Lyrics"]).trim() : null,
          meaning: r["Meaning"] ? String(r["Meaning"]).trim() : null,
        },
      });
    }
  }

  // 4) Instrumentalist Roster
  if (sheetNames.includes("Instrumentalist Roster")) {
    const ws = wb.Sheets["Instrumentalist Roster"];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[];
    console.log("Instrument roster rows:", rows.length);

    const instruments = [
      "Harmonium",
      "Chorus Mic",
      "Tabla",
      "Cymbals (Male)",
      "Cymbals (Female)",
      "Tambourine",
      "Ghanjira (small)",
    ];

    for (const r of rows) {
      const d = toDateOnly(r["Date"]);
      if (!d) continue;
      const session = await getOrCreateSession(d);

      for (const inst of instruments) {
        const person = r[inst];
        if (!person) continue;
        await prisma.sessionInstrument.create({
          data: {
            sessionId: session.id,
            instrument: inst,
            person: String(person).trim(),
          },
        });
      }
    }
  }

  // 5) Festival Bhajans
  if (sheetNames.includes("Festival Bhajans")) {
    const ws = wb.Sheets["Festival Bhajans"];
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
    const header = (matrix[0] || []).map((x) => (x ? String(x).trim() : null));
    for (let c = 0; c < header.length; c++) {
      const singerName = header[c];
      if (!singerName) continue;
      const singer = await prisma.singer.findUnique({ where: { name: singerName } });
      if (!singer) continue;

      let order = 1;
      for (let r = 1; r < matrix.length; r++) {
        const title = matrix[r]?.[c];
        if (!title) continue;
        const t = String(title).trim();
        const bhajan = await prisma.bhajan.findUnique({ where: { title: t } }).catch(() => null);
        await prisma.festivalBhajan.create({
          data: {
            singerId: singer.id,
            title: t,
            bhajanId: bhajan?.id,
            order: order++,
          },
        });
      }
    }
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

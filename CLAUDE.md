# CLAUDE.md — Naimisha Bhajan Roster

Read `docs/SPEC.md` before starting any feature work. This file is the standing
context; the spec is the product definition.

## What this is

A web app for the Naimisha Sai Centre bhajan group (Melbourne). It replaces a
Google Sheet. Three jobs:

1. **Suggest** a set of bhajans to sing at an upcoming session, drawn from a
   3,600-bhajan masterlist, filtered and shaped so the set actually works as a
   session.
2. **Roster** singers onto those bhajans fairly, at the right pitch.
3. **Remember** — who sang what, when, and at what shruti, so both of the above
   get smarter over time.

Current live data: 3,613 bhajans, 11 singers, 188 sessions, 709 sung records
spanning 2025-03-18 → 2026-08-09.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma ORM → PostgreSQL (Azure Database for PostgreSQL, Flexible Server)
- Deployed on Azure App Service (Linux, Node), via GitHub Actions on push to `main`
- All infrastructure runs under the centre's Azure nonprofit sponsorship
  subscription. Prefer first-party Azure services — third-party marketplace
  services are not covered by the grant credit.
- Auth: link-based edit key (`EDIT_KEY` env var + `middleware.ts`). See spec for
  the planned upgrade to named identities — do not rip this out until then.

## Commands

```bash
npm install
npm run prisma:migrate   # prisma migrate dev
npm run db:seed          # tsx scripts/seedFromXlsx.ts, reads data/roster.xlsx
npm run dev
npm run build            # prisma generate && next build
npm run lint
```

Azure Postgres requires `?sslmode=require` on the connection string. There is no
separate pooled/direct URL as there is with some providers — set `DIRECT_URL` to
the same value as `DATABASE_URL` unless PgBouncer is explicitly enabled.

`data/roster.xlsx` is the source of truth for the initial import only. After
seeding, the database is authoritative. Never write back to the xlsx.

---

## Domain glossary

Use these words in the UI. Do not translate them into generic terms.

| Term | Meaning |
|---|---|
| **Bhajan** | A devotional song. |
| **Shruti / pitch** | The tonic (Sa) a bhajan is sung at. Written `"<step> <Madhyam\|Pancham> / <Note>"`, e.g. `2 Pancham / D`. |
| **Sa** | The tonic. The note letter after the slash **is** the absolute Sa. |
| **Madhyam / Pancham** | Which drone the shruti box plays against Sa (Ma or Pa). It is a *convention label*, not a different pitch — `1 Madhyam / F` and `4 Pancham / F` are the same Sa. |
| **Raga** | Melodic mode. 236 distinct values in the masterlist, often dual-named (Carnatic / Hindustani), e.g. `Kalyani / Yaman`. |
| **Beat / taal** | 5 values: 8 Beat / Keherwa / Adi, 6 Beat / Dadra, 7 Beat / Rupak / Misrachapu, 10 Beat / Jhap Taal. |
| **Deity** | 21 values. `Sarva Dharma` = multi-faith. A bhajan may list several, comma-separated. |
| **Gents / Ladies** | The two reference-pitch tracks in the masterlist. Singer gender maps to which reference applies. Use these exact words — they are the group's own. |
| **Arati** | Closing offering. Not rostered as a bhajan slot. |

---

## The pitch model — canonical, verified against the data

This is the heart of the app. Get it wrong and everything downstream is wrong.

### Rules

1. **Absolute Sa comes only from the note letter after the slash.** Parse with
   `/\/\s*([A-G]#?)\s*$/`. Map to a pitch class `C=0 … B=11`.
2. **Madhyam vs Pancham does not change the pitch.** It is display metadata.
   Preserve whichever series the source label used when rendering; never
   silently convert one to the other.
3. **Tabla pitch = Sa + 7 semitones.** Verified true for all 24 pitch labels in
   the lookup table. Derive it; do not store it per-row.
4. **Deviation between two pitches** is the signed shortest distance mod 12,
   wrapped to `[-6, +6]`:

```ts
const PC = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };

export function saOf(label?: string | null): number | null {
  const m = /\/\s*([A-G]#?)\s*$/.exec((label ?? '').trim());
  return m ? PC[m[1] as keyof typeof PC] : null;
}

/** Semitones from `reference` to `actual`. +2 means sung two semitones higher. */
export function semitoneDelta(actual?: string | null, reference?: string | null) {
  const a = saOf(actual), r = saOf(reference);
  if (a === null || r === null) return null;
  const d = (a - r + 12) % 12;
  return d > 6 ? d - 12 : d;
}
```

5. **Recommended pitch is derived, never stored.** It is simply the bhajan's
   `reference_ladies_pitch` for a Ladies singer, `reference_gents_pitch` for a
   Gents singer. This was verified against 618 historical rows: 617 matched
   exactly, 1 was a typo. The existing `SessionSinger.recommendedPitch` column is
   redundant — drop it during migration and compute on read.
6. **Confirmed pitch is real data.** It is what the singer actually sang at, and
   it differs from the recommendation in 381 of 611 historical rows. That
   difference is the product's most valuable signal. Never overwrite it with the
   recommendation.

### Singer offset profiles (computed from the seeded history)

Median semitone offset from the gender reference — these are real and should
reproduce after seeding. Use them as a regression test for the pitch code:

| Singer | Gender | n | Median | Mean |
|---|---|---:|---:|---:|
| Sailavan | Gents | 99 | +1 | +0.85 |
| Ashwin | Gents | 96 | 0 | +0.31 |
| Prithvi | Gents | 89 | +1 | +1.35 |
| Jothsna | Ladies | 69 | 0 | +0.42 |
| Prasanna | Ladies | 63 | +1 | +1.05 |
| Pavitra | Ladies | 40 | 0 | +0.25 |
| Shravya | Ladies | 40 | 0 | +0.55 |
| Sriraag | Gents | 39 | 0 | −0.23 |
| Rhuben | Gents | 35 | 0 | 0.00 |
| Anvita | Ladies | 25 | 0 | −0.52 |
| Triveni | Ladies | 16 | 0 | +0.25 |

---

## Source data dictionary (`data/roster.xlsx`)

| Sheet | Rows | Maps to |
|---|---:|---|
| `Bhajan Masterlist` | 3,613 | `Bhajan` |
| `Singer Roster` | 709 | `Session` + `SessionSlot` |
| `Instrumentalist Roster` | 1,113 | `SessionInstrument` |
| `Lookup tables` | — | `Singer` (name+gender), `PitchLabel`, `InstrumentEligibility` |
| `Festival Bhajans` | 11 cols | `SingerRepertoire` (kind = `festival`) |
| `Singer Bhajan List - by singer` | 11 cols | `SingerRepertoire` (kind = `known`) |
| `Recent Bhajans` | 1,000 | Ignore — derive counts from `SessionSlot` instead |
| `Dates`, `Sheet38` | — | Ignore, scratch sheets |

`Bhajan Masterlist` columns, in order: `url, title, singers, meaning, lyrics,
audio, deity, language, raga, beat, level, tempo, reference_gents_pitch,
reference_ladies_pitch, music_notes_for_first_line, notes_range, tutorial,
sheet_music, song_tags, glossary_terms, debug_file, video, general_comments,
karaoke_tracks_for_practice, golden_voice, instrumental`.

### Known data quality issues — handle in the seed script

- Singer name `"Prithvi "` (trailing space) on 1 row. **Trim and collapse all
  singer names on import.**
- Coverage gaps in the masterlist, as a fraction of 3,613: deity 231 blank, raga
  565, level 1,062, tempo 1,115, beat 583, reference pitches 589.
  **Missing ≠ excluded.** Filters must offer a distinct "unspecified" state; a
  filter must never silently drop bhajans that simply lack that field.
- `deity` and `song_tags` are comma/space-delimited multi-values. Normalise into
  join tables at seed time; do not `LIKE '%Sai%'` at query time.
- One historical row has a recommended pitch that disagrees with the masterlist.
  Log it during seed, don't fail on it.

---

## Session conventions observed in the history

Derived from 188 real sessions. **Confirmed with Sailavan 2026-08-09** — see
§9 of `docs/SPEC.md`, which is authoritative where these disagree.

- Typical weekday session is **3 or 4 bhajans** (163 of 188 sessions). Sessions
  of 10+ are Sundays and festivals (5 sessions). Session length is a parameter
  and **defaults to 3** (§9.2).
- **Slot 1 is a Ganesha bhajan in 140 of 188 sessions.** Confirmed a *strong
  habit, not a rule* (§9.1) — weight it, never enforce it. Same for the Sai
  closer.
- Tempo arcs: slot 1 Medium → slot 2 Medium Slow / Slow → slot 3 Medium Fast.
  The set builds; it does not start fast.
- Gents/Ladies alternate loosely across slots, never strictly.
- Closing slots skew Sai.

---

## Conventions

- **Server Components by default.** Client components only where there is real
  interactivity (filter panel, re-roll, drag-reorder).
- **Server Actions for mutations**, `zod`-validated at the boundary. No
  unvalidated `FormData` reaching Prisma.
- **All domain logic lives in `lib/`** as pure functions with no Prisma import —
  pitch math, suggestion scoring, roster scoring. These must be unit-testable
  without a database. Add `vitest`; there are currently no tests.
- **No `any`.** No `@ts-expect-error` without a comment explaining the cause.
- **Dates are session dates, not timestamps.** Store as `@db.Date`, handle in
  `Australia/Melbourne`. Do not let UTC shift a session onto the wrong day.

### Time and timezones

Three separate things, and keeping them separate is what stops the whole class
of "it says Tuesday but it is Wednesday" bugs:

| Thing | What it is | Rule |
|---|---|---|
| `Session.date` | A **calendar date** at the venue. `@db.Date`, arrives as UTC midnight. | Format it with `timeZone: "UTC"`. Never with the reader's zone — that is what puts a Thursday session on Wednesday for anyone west of UTC. |
| `Session.startsAt` | A **wall-clock time**, `"HH:MM"`. Not an instant. | Never store it as a `DateTime`. |
| `Session.timeZone` | **Whose clock** `startsAt` is on. IANA name, defaults to `Australia/Melbourne`. | The only thing that turns the two above into a moment. |

- All the arithmetic lives in `lib/timezones.ts`. Use `sessionInstant()` to get a
  real moment; never add a fixed offset — Melbourne is +10 for half the year and
  +11 for the other half.
- Compare zones with `sameZone()`, never with `===`. ICU disagrees with itself
  about whether `Asia/Kolkata` or `Asia/Calcutta` is canonical, and the two
  spellings are unequal while meaning the same thing.
- Decide whether to show a conversion with `sameClock()`, which compares
  offsets. Sydney and Melbourne are different zones that always agree; a Sydney
  member must not be shown "7pm · 7pm your time".
- **Venue time leads, always.** `components/SessionTime.tsx` renders the venue's
  time and *adds* the reader's own after mount. Never replace one with the
  other: the group says "7pm" and means the hall's clock.
- Anything derived from the reader's zone must be added in an effect, not
  rendered on the server, or hydration fails.
- **"Today" is the reader's today** (`deviceTodayISO`), not UTC's and not the
  server's. The server renders `melbourneTodayISO()` as its best guess and the
  client corrects it on mount when the device disagrees.
- Two places deliberately stay in venue time: the **calendar** (its day panel
  labels are disambiguators between sessions on one day, and both shift
  equally) and **notifications** (they are text sent to a subscriber, with no
  reader present to convert for).
- Never commit `.env`. `.env.save` is currently tracked in git — remove it and
  rotate anything it contained.

## Definition of done for any feature

1. `npm run build` and `npm run lint` clean.
2. Unit tests for any new `lib/` logic.
3. Works at 375px wide. Singers use this on phones, standing up, in a hall.
4. Keyboard-focusable, visible focus rings, `prefers-reduced-motion` respected.
5. No feature silently discards a singer's `confirmedPitch` or their history.

## Working style

- Use plan mode for anything touching the schema, the seed, or the pitch math.
  Show the plan before writing code.
- Small commits, descriptive messages, one concern each.
- When a product decision is ambiguous, **ask rather than guess.** This app
  encodes a real group's traditions; inventing conventions is worse than
  pausing.

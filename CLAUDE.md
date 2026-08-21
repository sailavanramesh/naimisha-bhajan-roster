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

### The hosting, as it actually stands (2026-08-21)

Worth knowing before diagnosing "the app is slow": most of that story is here
rather than in the code.

- **Two App Service plans**, both B1 Linux in Australia East.
  `asp-naimisha-roster` carries production alone, with Always On;
  `asp-naimisha-roster-dev` carries dev, also with. They shared ONE plan until
  2026-08-21 — one vCPU and 1.75 GB between both apps — so dev waking up took
  CPU from production. A restart was measured answering in 6–18 seconds while
  the two booted together, settling to ~250 ms once warm. Keep them separate.
- **HTTP/2 is on for both**, from 2026-08-21. It was off, which capped a phone
  at about six parallel requests for the thirty-odd chunks and fonts a page
  pulls.
- **Postgres is Burstable** (`psql-naimisha-roster`, Standard_B1ms). It earns
  CPU credits and is throttled to a fraction of a core when they run out, which
  is why a query costs a few milliseconds one minute and thirty the next. Prefer
  ONE `Promise.all` over several sequential `await`s in a page: the number of
  round trips is what that variance multiplies.
- **public/ is cached immutable** by `headers()` in `next.config.js` — fonts,
  tanpura audio, icons. `sw.js` is deliberately excluded: a cached service
  worker is an app that cannot update itself.
- `LOG_QUERIES=1` turns on Prisma statement logging (`lib/db.ts`), for counting
  a page's round trips rather than guessing at them.
- **The masterlist is cached, not re-read.** `lib/candidateQueries.ts` splits it
  in two: `loadBhajans` (3,607 rows, `unstable_cache`, tag `masterlist`,
  one-hour backstop) and `loadSungHistory` (765 rows, per-request only, because
  rostering changes it and stale "last sung" would re-propose Thursday's
  bhajans). `loadMasterlist` joins them once per request with React `cache`, the
  same way `getSignedInSinger` works.

  Measured 2026-08-21: that read WAS both pages. Rendering one bhajan instead of
  fifty — 78 KB against 306 KB — changed `/explore` by nothing, because the
  fixed part is all of it. **Anything editing a bhajan must
  `revalidateTag(BHAJANS_TAG)`**; the three app write paths do. The seed and
  backfill scripts cannot, so for them the hour is the mechanism — or restart
  the app.

  Never select `lyrics` to ask whether a bhajan has any: it is 0.72 MB of Text
  across the table, and the answer is a list of ids.

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

1. **Sa comes from the STEP NUMBER, not from the letter alone.** The note after
   the slash is the DRONE note: in Pancham that note IS Sa, in Madhyam it is
   **Ma, a perfect fourth above Sa**. So Sa is the written note for Pancham and
   the written note **minus five semitones** for Madhyam. One constant does
   this, `NOTE_ABOVE_SA` in `lib/pitch.ts`; nothing else should ever subtract a
   five.

   `4.5 Madhyam / B` is **Sa F#** with B droning against it. `4.5 Pancham / F#`
   is **Sa F#** with C# droning against it.

   > Corrected 2026-08-20, on Sailavan's instruction after hearing the tanpura
   > play. **Four independent measurements argue against it** and are recorded
   > in full against `NOTE_ABOVE_SA` — chiefly that on 97 bhajans written in two
   > series the gents-to-ladies interval matches the other 2921 only under the
   > old reading (90 of 97 versus 0 of 97). The likeliest account is that the
   > source sheet was filled in comparing letters, whatever the shruti box does.
   > Setting `Madhyam: 0` reverses everything.

2. **The series does not change Sa.** The same step number is the same Sa in
   both series; only the drone note differs. Preserve whichever series the
   source label used when rendering; never silently convert one to the other.
3. **Tabla pitch is chosen, not computed.** The order is **Sa, then Ma, then
   whatever the raga contains** — `recommendTabla` in `lib/tabla.ts`, against
   the four drums the ashram owns (C, C#, D, E) and the raga's own notes. A
   raga without a Pa cannot have its tabla tuned to one, so every degree is
   checked against the scale rather than assumed. Where the raga is unknown the
   answer is marked `assumed`.

   Over the 688 sung records: Sa 51.5%, Ma 25.7%, Pa 11.6%, then thirds, sixths
   and flat sevenths, with 3.1% that no drum they own fits.

   `tablaPitchOf` in `lib/pitch.ts` still returns the bare fifth, Sa + 7. It is
   the OLD rule and takes no account of the raga or of which drums exist.
   Nothing anybody reads goes through it any more: the roster grid, the live
   view, the printed sheet and — from 2026-08-21 — the shruti ladder all use
   `recommendTabla`. Its one remaining caller is `lib/pitchSuggestions.ts`,
   filling `SessionSlot.alternativeTablaPitch`, a stored column nothing
   displays. Prefer `recommendTabla` for anything a player acts on.

   The ladder is the one view that asks the question for all twelve Sa at once,
   so it is where the old rule was most visibly wrong: it named a drum on every
   row, including the Sa whose fifth the centre does not own. Two Sa — D♯ and
   A♯ — now read **"none"** where the raga offers nothing, which is an answer
   (sing at a different shruti), not missing data.

   Do not read `PitchLabel.tablaPitch` from the database. It is the written
   note + 7 in all 24 rows, which under rule 1 is wrong for the twelve Madhyam
   ones.

4. **Deviation between two pitches** is the signed shortest distance mod 12,
   wrapped to `[-6, +6]`:

```ts
const PC = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };

const NOTE_ABOVE_SA = { Pancham: 0, Madhyam: 5 };

export function saOf(label?: string | null): number | null {
  const raw = (label ?? '').trim();
  const m = /\/\s*([A-G]#?)\s*$/.exec(raw);
  if (!m) return null;
  const written = PC[m[1] as keyof typeof PC];
  if (written === undefined) return null;
  const above = /madhyam/i.test(raw) ? NOTE_ABOVE_SA.Madhyam : NOTE_ABOVE_SA.Pancham;
  return (((written - above) % 12) + 12) % 12;
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
reproduce after seeding. Use them as a regression test for the pitch code.

**Recomputed 2026-08-20** under rule 1 as corrected. Every sample count is
unchanged, which is the part that proves the import is intact; the offsets moved
because 52 of 669 comparisons put a Madhyam label against a Pancham one. The
previous figures are in git at 2b40a4d:

| Singer | Gender | n | Median | Mean |
|---|---|---:|---:|---:|
| Sailavan | Gents | 99 | +1 | +0.90 |
| Ashwin | Gents | 96 | 0 | +0.625 |
| Prithvi | Gents | 89 | +1 | +1.63 |
| Jothsna | Ladies | 69 | 0 | +0.43 |
| Prasanna | Ladies | 63 | +1 | +0.90 |
| Pavitra | Ladies | 40 | 0 | +0.375 |
| Shravya | Ladies | 40 | +1 | +1.18 |
| Sriraag | Gents | 39 | 0 | +0.21 |
| Rhuben | Gents | 35 | 0 | +0.14 |
| Anvita | Ladies | 25 | 0 | −0.32 |
| Triveni | Ladies | 16 | 0 | −0.50 |

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

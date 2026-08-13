# PROGRESS

Running log for the v2 rebuild. **Assume the reader has no memory of previous
sessions** and only has `CLAUDE.md`, `docs/SPEC.md`, this file, and the code.

Updated after every phase: what is done, what is next, decisions and why, and
open uncertainties.

---

## Removed copy — kept verbatim in case it is wanted back

Sailavan asked for these to go on 2026-08-11 and said to remember them. They
were removed, not reworded; if any is asked for again, restore exactly this.

**1. Site strapline** (`app/layout.tsx`, under the title):

> Suggest a set, roster it fairly, remember the pitch.

**2. Build a session — under the repertoire filter** (`app/build/page.tsx`):

> Only about 600 of the 3,607 bhajans have ever been sung here, so "anything"
> will often suggest songs nobody knows yet. That is deliberate — it is how the
> group learns new material — but pick **only bhajans the group has sung** when
> you need a set that will work this week.

**3. Build a session — beside "Save as draft session"** (`app/build/page.tsx`):

> Saves the bhajans, not the seed — the generator's weights change as history
> grows, so the same seed will not reproduce this set later. Singers are
> assigned in the roster.


## Auto-add by fairness (assign page)

A second way to fill a session, alongside picking by hand — which stays the
mainstay. "Add 3 fairest" puts on whoever is most owed a turn.

`fairestSingers` in `lib/rosterScoring.ts`, 13 tests. Only the fairness terms
apply — overdue, load balance, and a gender-clump penalty so the picks
alternate voice — because the others need a bhajan to score against.

**Decisions and why:**
- *Bhajans are left blank.* Who sings and what they sing are separate
  decisions, and the fairness score has nothing to say about the second.
  Filling one in would put a bhajan on the roster that nobody chose.
- *Pressing it again tops up rather than duplicating*, and continues the voice
  pattern already on the session so a second press cannot create a run of three.
- *Greedy, not exhaustive.* Eleven singers and three slots; the difference from
  an optimal search is nil and the order it produces is the order shown.


## Tabla tuning (which drum to bring)

The ashram owns tablas in **C, C#, D, E**. The app now says which of them to
bring and tune, rather than printing Sa + 7 and leaving the player to work out
whether that drum exists.

**Rule.** Walk the degrees in order, skipping any the raga does not contain,
and take the first that lands on an owned drum:

    Sa  ->  Pa (5th)  ->  Ma (4th)  ->  3rd (major or minor, as the raga uses it)
        ->  6th  ->  flat 7th

Sailavan: the fourth beats the third. Raga Desh is the case — its third is
absent ascending and present descending, and tuning to it "doesn't sound
right" where the fourth does. Degrees NOT offered at all: the 2nd, the 7th and
the tritone, which beat against a drone.

**Measured over the 639 sung records:** 96.6% resolve. Sa 49.9%, fifth 27.2%,
fourth 10.6%, sixth 5.0%, third 2.8%, flat seventh 0.9%; 3.4% have no fit.
82.5% rest on known raga notes, 14.1% on the assumption that the raga has Sa,
Pa and Ma — shown as "assumed" on screen rather than passed off as fact.

**Files:** `lib/tabla.ts` (rule, 21 tests), `lib/ragaScales.ts` (seeded note
sets), `lib/tablaPlan.ts` (overrides + session plan),
`app/roster/[id]/TablaPanel.tsx`, `tablaActions.ts`. Migration
`20260811090000_tabla_override`, additive; the Phase 0 gate still passes.

**Decisions and why:**
- *Overrides are keyed on (raga, Sa), not on the bhajan.* Those two are exactly
  what the rule consumes, so correcting an answer once corrects it everywhere
  it would recur. Keying per song would ask a coordinator the same question
  repeatedly and let the answers drift apart.
- *Only four tonics ever get past Sa and the fifth:* G#, B, A#, D#. G# and B
  take the fourth. A# is decided by WHICH third the raga uses — komal Ga gives
  C#, shuddha Ga gives D, and the ashram owns both. D# is rescued only by the
  sixth or the flat seventh.
- *An unknown raga is not guessed at.* It falls back to Sa/Pa/Ma and is
  labelled assumed. That is wrong for Malkauns (no Pa) and Kalyani (sharp
  fourth), which is exactly why it says so.

**Confirmed by Sailavan, 2026-08-11.** He checked every case where the rule
goes past Sa and the fifth — A# with a major third (D), A# with a minor third
(C#), G# in Kalyani (C, skipping the sharp fourth), G# in Malkauns (C#,
skipping the absent fifth), G# in Mohanam (C, no Ma at all), D# in Desh (C, the
sixth) and D# in Darbari (C#, the flat seventh) — and all seven were right. He
also confirmed Kalyana Vasantham takes the NATURAL fourth, which is now fixed
and lifted coverage to 96.9%. Those answers are pinned as tests in
`lib/tabla.test.ts`, so they are the group's ruling rather than my reasoning.

**Known limits — STILL OPEN:**
- `lib/ragaScales.ts` was otherwise seeded by Claude from standard
  melakarta/thaat theory, NOT supplied by the centre. Anything wrong is
  correctable in place, and any single answer can be overridden from the roster
  page.
- **Sailavan, 2026-08-11: do NOT hand-code the remaining ragas.** Neither the
  ~15 combinations with nothing usable nor the ~30 ragas absent from the table.
  He will decide them as they come up and the app collects the answers, so the
  rule can be refined from real decisions rather than from my theory. The
  collection surface is Admin -> Tabla decisions, which shows each hand-picked
  answer beside what the rule computed; a disagreement means either the raga's
  notes are wrong or the degree order is, and which becomes clear once a few
  accumulate. Nothing is silently wrong meanwhile — an unresolved case says
  "needs a decision" and an unknown raga says "assumed".
- Ragas still missing that appeared in the history: Khamas, Hamir Kalyani /
  Kedar. Adding them would resolve 6 of the 22 remaining no-fit records.
- The roster grid still shows the old Sa+7 "Tabla" column. It is the historical
  record, so it stays; the panel above is the prescriptive answer.


## Singer-first assignment (assign page)

Pick a person, then choose what they sing — the reverse of the fairness
assigner, which fills existing slots.

**Done:** `lib/bhajanSimilarity.ts` (15 tests), `lib/suggestedPitch.ts` (12),
`pitchRank`/`lowestPitch` in `lib/pitch.ts` (9), `addSingerSlot` action,
`AddSingerPanel`, `suggestions.ts`.

**Decisions and why:**
- *Similarity is categorical, not embeddings.* Deity, raga, tempo, beat,
  language, level, tags, weighted-overlap scored. Text embeddings would mean a
  third-party API outside the Azure sponsorship, and the resemblance that
  matters is musical rather than semantic.
- *A missing field is not a mismatch.* An unknown raga drops out of the average
  instead of scoring zero. The masterlist has real gaps (565 no raga, 1,115 no
  tempo), and scoring absence as dissimilarity would rank well-described
  bhajans below sparse ones for no musical reason.
- *"Lower pitch" means lower on the group's printed Pancham ladder* (C is rung
  0, B rung 11). Sa is a pitch class with no octave, so the circle has to be
  cut somewhere; this cuts it where the lookup table already cuts it. Two
  labels tie exactly when they are the same Sa.
- *Predictions are never written to `confirmedPitch`.* Only a pitch the singer
  committed to — on their list, or previously sung — is saved. The offset
  profiles are computed FROM that column, so writing a prediction into it would
  let the model train on its own output and drag every singer towards their
  current median. The page shows the prediction for a human to accept.

**Known limits:**
- `SingerRepertoire.preferredPitch` is NULL on all 485 rows — the source sheets
  never had it. The "from their list" pitch source is built and tested but
  dormant until someone records one on /my-list. "Sung before" does fire:
  there are 154 list-and-sung pairs.
- Similar-bhajan groups exclude anything the singer has already sung, so a
  suggestion carrying a "sung before" pitch only ever appears under "On their
  list".


## Mic cushion colours (sound desk)

Four cushion colours — blue, grey, orange, pink — on each rostered singer in a
session, so the mic and sound people can see which cushion is on which mic and
EQ accordingly. Settable by any signed-in user (Editor or Member).

**Done:**
- `MicCushion` model, keyed `(sessionId, singerId)`. Migrations
  `20260810040000_mic_cushion` and `20260810041000_mic_cushion_nullable`, both
  additive. The Phase 0 gate was re-run after each and still passes.
- `lib/micCushion.ts` — pure palette + merge logic, 15 vitest tests.
- `app/roster/[id]/micCushionActions.ts` — zod-validated Server Action.
- `app/api/sessions/[id]/cushions/route.ts` — poll endpoint.
- `components/MicCushions.tsx` — polling hook + the dots.
- `scripts/verifyMicCushions.mjs` — two-browser live proof, all assertions pass.

**Decisions and why:**
- *Its own table, not a column on `SessionSlot`.* `SessionSlot.updatedAt` drives
  the roster's optimistic-concurrency guard. A cushion colour on that row would
  bump `updatedAt`, so a sound person tapping a dot would make a coordinator's
  roster save fail as a conflict that is not one — during a live session, which
  is exactly when both happen at once. It also has different authorisation, and
  `SessionSlot` is the historical record whereas this is live operational state.
- *Keyed on the singer, not the slot.* Sailavan: the cushion should follow the
  singer within a session. One mic per singer per night; a singer with two
  bhajans shows the same cushion on both rows.
- *Last-writer-wins, deliberately.* Opposite of the roster grid. Each write is a
  single-row upsert, so different singers can never clobber each other — the
  failure that would actually hurt. Two people on the SAME singer: last tap
  wins, silently. A conflict dialog aimed at a sound engineer mid-session would
  be the wrong trade.
- *`colour` is nullable.* "Cushion removed" is an explicit timestamped state. A
  deleted row carries no `updatedAt`, so removal would be indistinguishable from
  "not loaded yet" and a stale poll could resurrect a cleared cushion.
- *Polling every 4s, not SSE/WebSockets.* One B1 instance behind the Azure front
  end; a held-open connection per device is the fragile option. Polling pauses
  on a hidden tab and polls immediately on return.
- *Bigger touch targets on mobile* (28px vs 18px): tapped one-handed, standing
  up, in a hall.

**Known limits:**
- Azure Postgres B1ms allows 50 connections total. Not a problem at one App
  Service instance, but scaling out would need a pooler before it would be.
- The cushion is not shown on the print sheet. Add it if the desk wants paper.


## Current state

**Branch:** `v2`, branched from `main` @ `0788398` and **pushed** to
`origin/v2` (2026-08-09). Not yet merged, so nothing has deployed.
**Phase:** **Phases 0–5 are complete and green.** What remains needs Sailavan —
see [Next](#next).

The database is seeded and live. `npm run build`, `npm run lint` and
`npm run test:run` are all clean: **187 tests, 1 skipped** (the skip is the
database-backed gate, which skips only when `DATABASE_URL` is absent).

**The Phase 0 gate has been re-run after every schema change since and still
reproduces the CLAUDE.md offset table exactly.** If it ever fails, stop and
report it — do not adjust the expected values.

### Deploying

`v2` is pushed. **Merging `v2` into `main` triggers a real production deploy** —
that is the only remaining step to ship, and it is deliberately a human
decision.

Two things to know before merging:

- Migrations are **already applied** to the live database and are **not** run by
  CI, so the merge deploys code against a schema that is already correct.
- `gh workflow list` shows nothing yet, and that is expected: GitHub only
  registers a workflow once it exists on the **default branch**. It will appear
  after the merge.
- The OIDC federated credential is scoped to `repo:...:ref:refs/heads/main`, so
  a `workflow_dispatch` run from any other branch will fail to authenticate to
  Azure. Add a second credential if branch deploys are ever wanted.

---

## Infrastructure (live, provisioned via Azure CLI on 2026-08-09)

Subscription: `Azure subscription 1` / `d068b431-9d2e-4045-9688-2a7e5fa14fea`
Tenant: JNANA VEDANTA INSTITUTE LTD. (`apps.jnanavedanta.org`)
Confirmed nonprofit sponsorship: subscription `quotaId` is `Sponsored_2016-01-01`.

| Resource | Name | Detail |
|---|---|---|
| Resource group | `rg-naimisha-bhajan-roster` | `australiaeast` (Sydney) |
| PostgreSQL Flexible Server | `psql-naimisha-roster` | Burstable `Standard_B1ms`, PG 16.14, 32 GiB |
| Database | `naimisha` | UTF8 / `en_US.utf8` |
| App Service plan | `asp-naimisha-roster` | Linux, B1 Basic |
| Web App | `naimisha-bhajan-roster` | `NODE|22-lts`, Always On, startup `npm run start` |
| Entra app registration | `gha-naimisha-bhajan-roster` | OIDC deploy identity, Contributor on the RG |

Host: `psql-naimisha-roster.postgres.database.azure.com`
Site: `https://naimisha-bhajan-roster.azurewebsites.net`

**Firewall rules on the Postgres server**

- `AllowAllAzureServicesAndResourcesWithinAzureIps…` — `0.0.0.0/0.0.0.0`, the
  "allow Azure services" toggle. This is what lets the Web App connect.
- `AllowSailavanDevMachine` — `122.199.63.165`. **Migrations run from an
  allowlisted machine, not from CI.** GitHub-hosted runners have unpredictable
  egress IPs and are deliberately not allowlisted.

**Estimated cost** (Azure retail price API, Australia East, AUD, 730 h/month)

| Line | Rate | Monthly |
|---|---|---:|
| App Service Basic B1 Linux | 0.0275 AUD/h | 20.08 |
| PostgreSQL Burstable B1MS compute | 0.0377 AUD/h | 27.52 |
| PostgreSQL storage, 32 GiB | 0.20 AUD/GiB/mo | 6.40 |
| Backup (≤100% of provisioned storage) | included | 0.00 |
| **Total** | | **≈ 54 AUD/month** |

Resource group, Entra app registration, and OIDC federation cost nothing.

---

## Secrets

- `.env` at the repo root holds `DATABASE_URL`, `DIRECT_URL`, `EDIT_KEY`,
  `XLSX_PATH`. Mode `600`, git-ignored. Not committed, ever.
- The same four values (minus `XLSX_PATH` semantics) are set as Web App
  application settings.
- The DB admin password and `EDIT_KEY` were generated locally; they exist in
  `.env` and in the Web App settings and nowhere else.
- `.env.save` was untracked with `git rm --cached` and added to `.gitignore`.
  Its contents were never read. **It was committed to `main` historically, so
  anything it contained must still be treated as compromised and rotated** —
  removing it from the tip does not remove it from history.

---

## Deployment

`.github/workflows/azure-deploy.yml`, on push to `main` (plus manual dispatch).

Decision: **OIDC federated identity, not a publish profile.** The Web App was
created with SCM basic auth disabled (`allow: false`, the current Azure
default). A publish profile would have required re-enabling basic auth on the
SCM endpoint — a permanent security downgrade — so a federated credential was
used instead. GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`AZURE_SUBSCRIPTION_ID`. No long-lived secret exists.

The workflow lints, tests, builds, prunes dev dependencies, and ships a
prebuilt zip (`SCM_DO_BUILD_DURING_DEPLOYMENT=false`) — a B1 instance is too
small to build Next.js reliably on-box.

The workflow does **not** run `prisma migrate deploy`. Migrations are applied
by hand from an allowlisted machine. This is deliberate: it keeps automated
processes away from a database whose 709 `confirmedPitch` values exist nowhere
else.

---

## Done so far

- [x] Azure CLI installed; `az login` and `gh` auth confirmed
- [x] All infrastructure provisioned (table above)
- [x] Repo cloned, branch `v2` created
- [x] `docs/` created; `CLAUDE.md` → root, `SPEC.md` → `docs/`,
      `Naimisha Bhajan Roster .xlsx` → `data/roster.xlsx`
- [x] `.env.save` untracked and ignored, committed
- [x] `CLAUDE.md` and `docs/SPEC.md` read in full; existing code reviewed
- [x] `npm install`; `prisma migrate deploy` applied `20260101081006_init` to
      the live Azure database — 9 tables present, connection confirmed
- [x] vitest added (`npm run test:run`)
- [x] GitHub Actions deploy workflow written, OIDC identity + secrets in place
- [x] Seven questions answered and written into `docs/SPEC.md` §9
- [x] **Phase 0 complete** — see below

## Next

**Phases 0–5 are built, tested and committed**, plus instrument rotation, an
admin section and a server-side edit gate. What remains:

1. **Merge `v2` into `main`** to deploy. Everything else is pushed.
2. **Named auth (SPEC §4.I Phase 2 / roadmap Phase 5).** Google sign-in via
   Auth.js behind a coordinator-maintained email allowlist. It needs a Google
   Cloud OAuth client ID and secret, which only Sailavan can create. The schema
   is ready for it: `Singer.email` (unique) and `Singer.role` already exist.
   `EDIT_KEY` + `middleware.ts` stays until then — do not rip it out.
3. **Wire instrument picks into the assign page.** `lib/instrumentScoring.ts`
   is written and tested, and eligibility is editable at `/admin`, but the
   suggestions are not yet rendered on `/roster/[id]/assign`. The remaining
   work is a query returning `PlayerContext[]` plus a UI section — no new
   decisions.


---

## Phase 0 — foundation (complete)

**Migration.** Two forward migrations, `20260809012000_v2_schema` and
`20260809013000_search_vector_trigger`, both applied to the live database with
`prisma migrate deploy`. `prisma migrate diff` reports no drift.

The first migration drops and recreates `SessionSinger` / `FestivalBhajan` /
`PitchLookup`. That was safe **only** because it ran against the freshly
provisioned database before the first seed, when those tables held zero rows.
It says so in a header comment. **Every migration from here must be
non-destructive.**

**Seed.** `scripts/seedFromXlsx.ts` rewritten. Supports `--dry-run` and
`--force`, and refuses to run against a database that already holds session
slots. It only ever inserts or updates — never deletes, truncates or resets.

Seeded totals, all matching CLAUDE.md: 11 singers, 24 pitch labels, 3,607
bhajans, 21 deities, 49 tags, 709 slots, 200 sessions, 424 instrument
assignments, 485 repertoire entries.

**`lib/pitch.ts`.** The pitch model as pure functions, no Prisma import. 35
unit tests, including tabla = Sa + 7 checked against all 24 real labels and a
transposition round-trip over every label.

**The gate.** `tests/singerOffsets.test.ts` reads the seeded Azure database and
reproduces the CLAUDE.md offset table exactly — eleven singers, 611 rows, every
n, median and mean. Expected values are literals copied from CLAUDE.md and were
**not** adjusted. It skips loudly when `DATABASE_URL` is absent, so CI passes
without database access; it must be run locally from an allowlisted IP.

### What Phase 0 turned up in the data

Four things worth knowing before touching the seed again.

1. **The offset table is defined against the sheet's own recommendation
   column**, `Recommended Pitch as Sai Rythms` — not against a masterlist
   reference lookup. The two agree on *value* (617 of 618 rows) but disagree on
   which rows *qualify*, because some roster rows name a title absent from the
   masterlist and some masterlist-matched rows have no sheet recommendation.
   Computing the table the other way gives 609 rows and misses 5 of 11 singers.
   This is why `historicalRecommendedPitch` still exists.

2. **The date column is headed `"  "` (two spaces)**, and the old seed looked
   it up as `"."`. Against this export it would have imported zero dates. It is
   now resolved positionally.

3. **Dates are Melbourne-local midnight instants.** `2025-03-17T13:00:00Z` is
   18 March AEDT. Reading the UTC calendar date shifts every session back a
   day. The seed converts through `Australia/Melbourne`; the resulting range,
   2025-03-18 → 2026-08-09, matches CLAUDE.md exactly and is the proof.

4. **Six masterlist titles are duplicated, and four of the six carry different
   reference pitches.** `title` is the natural key, so only one row survives —
   the first in sheet order. Which one wins changes the reference pitch for
   those bhajans. The seed logs every conflict. This also explains CLAUDE.md's
   "617 matched, 1 was a typo": that count comes out of a last-wins read, and
   first-wins gives 618/618. Nothing is wrong; the two readings just differ.

Also: **12 sessions have instrumentalists but no singer slots**, so the
database holds 200 sessions where CLAUDE.md says 188. The 188 figure counts
sessions with singers. Dropping the other 12 would have discarded real roster
history, so they were kept.

### Decisions taken in Phase 0

| Decision | Why |
|---|---|
| Kept `recommendedPitch` as `historicalRecommendedPitch` | CLAUDE.md rule 5 says drop it; the hard rule says the offset table must reproduce from the database. Both cannot hold. The hard rule wins, so the column survives as immutable historical record. Nothing derives a live recommendation from it — that still comes from the masterlist. |
| Search vector trigger-maintained, not `GENERATED` | Prisma introspects a generated column as having a default and emits `ALTER COLUMN ... DROP DEFAULT`, which Postgres rejects on generated columns. That left permanent, unappliable drift. |
| `simple` text-search config, not `english` | Transliterated Sanskrit. English stemming mangles it. |
| Instrument-only dates create sessions | Losing real roster history is worse than a session count that differs from a line in CLAUDE.md. |
| Duplicate titles: first in sheet order wins | Arbitrary but deterministic, and every conflict is logged rather than silently resolved. |
| Reordering slots parks rows on negative positions first | `@@unique([sessionId, position])` is checked per statement, not at commit, so an in-place reorder would collide. |
| Replaced `next lint` with ESLint 9 flat config | `next lint` was never configured — it dropped into an interactive prompt, so lint had never actually run. It is also removed in Next 16. |

---

## Decisions and why

| Decision | Why |
|---|---|
| Region `australiaeast` | Widest service availability of the Australian regions; the group is in Melbourne, so latency from `australiasoutheast` would be marginally better but B-series and App Service SKU coverage is better in Sydney. |
| **Node 22 LTS, not Node 20** | Node 20 LTS is **no longer offered** on Azure App Service Linux — the only runtimes available are `NODE\|24-lts` and `NODE\|22-lts`. 22 is the closest to what was asked for and is supported to 2027-04-30. Change with `az webapp config set --linux-fx-version`. |
| `prisma migrate deploy`, never `migrate dev` | `migrate dev` can offer to reset the database. Against production that is unrecoverable. |
| Migrations not run from CI | GitHub runner egress IPs are not allowlisted, and automating writes to this database is not worth the convenience. |
| OIDC over publish profile | Avoids re-enabling SCM basic auth. See Deployment above. |
| Patched local `pyexpat` | Homebrew's `azure-cli` ships Python 3.14 whose `pyexpat` links against the macOS system `libexpat`, which lacks a symbol it needs — every `az webapp` command crashed on import. Repointed the module at Homebrew's `expat` with `install_name_tool` + `codesign`. Purely a local toolchain repair; undo with `brew reinstall python@3.14`. |

---

## Phase 1 — pitch intelligence (complete)

`lib/singerProfile.ts` (pure, 25 tests), `lib/pitchQueries.ts` (Prisma side),
`components/ShrutiLadder.tsx`, wired into `/singers/[id]` and `/bhajans/[id]`.
Both pages were rendered against the live database and their output inspected,
not merely typechecked.

- **Offset profiles**, overall and per raga (≥5 observations, per SPEC §4.D).
- **Predicted pitch**: prefers a confident raga profile, falls back to the
  overall profile, falls back again to the bare reference below 5 samples —
  and says which, with the sample size, rather than implying false precision.
- **Comfort band** on absolute Sa, handling the circularity of pitch classes
  by rotating to the singer's modal Sa before taking percentiles. A naive
  percentile over 0..11 reports an 11-semitone spread for two adjacent notes
  either side of B/C.
- **Shruti Ladder**: all 24 labels, reference in ivory, actual/predicted in
  kumkum, deviation stated numerically, comfort band shaded, with a
  screen-reader summary. `--kumkum` is reserved to pitch deviation, per §6.

Note the ladder marks **two** rungs as the reference when Sa is shared between
series — `1 Madhyam / F` and `4 Pancham / F` are the same Sa. That is correct
and intended (CLAUDE.md rule 2), not a bug.

**Profile counts differ slightly from the Phase 0 gate, by design.** The gate
measures strictly against `historicalRecommendedPitch` (611 rows). The profiles
fall back to the masterlist reference when no sheet recommendation exists, so
they see a little more data — Prithvi is 92 rows here against 89 in the gate.
Both are correct for their purpose; the gate is deliberately the stricter one.

### The comfort-range flag was built, tested, and deliberately not shown

SPEC §4.D asks for a proposed pitch outside the comfort band to be flagged.
It is implemented and tested, but it is **not** rendered on the prediction
table, for two reasons found in the data:

1. A prediction is the singer's own median offset applied to the reference, so
   it is inside their band **by construction**. The badge fired on most rows.
2. The bands are wide — 5 to 10 semitones per singer, with every singer having
   sung at 9–12 of the 12 possible Sa values. Absolute Sa is a property of the
   *bhajan*, not the voice. The tight, singer-specific quantity is the offset.

`isOutsideComfort` is kept and tested for use where it is meaningful: pitches a
**human** proposes — coordinator overrides and confirmed-pitch entry — which
arrive in Phase 3. See OPEN-QUESTIONS.

---

## Phase 2 — session builder (complete)

`lib/sessionBuilder.ts` (pure, seeded, 37 tests), `lib/candidateQueries.ts`,
`lib/defaultTemplates.ts`, `scripts/seedTemplates.ts`, `lib/draftGuard.ts`
(8 tests), and `app/build`.

**All generator state lives in the URL** — seed, template, length, every
filter, and which slots are locked. That is what makes a set reproducible and
shareable, as SPEC §4.B requires, and it keeps the page a server component.
Re-roll bumps a numeric seed suffix; swap locks everything else and re-rolls.

**Two flaws that only appeared against real data.** Both passed a synthetic
test pool and were caught by running the page against the live masterlist.
There is now a regression suite mirroring the real proportions.

1. *Soft rules as weight multipliers do not work.* Only ~7% of the masterlist
   is Ganesha. Even a ×6 multiplier lost to the 3,000-odd non-matching
   candidates, and the Ganesha opener almost never appeared. Soft rules now
   draw from the **matching subset 85% of the time**, which behaves like a
   habit regardless of pool composition and still never blocks generation.
2. *Linear novelty erased the group's repertoire.* `1/(1+timesSung)` with
   ~3,000 never-sung bhajans made every session three songs nobody knew.
   Now `1/sqrt(1+timesSung)` — never-sung is still preferred, not dominant.

Because of (2) there is also a **Repertoire control**: anything / only sung
before / only never sung. "Only sung before" gives a 392-bhajan pool and
produces sets the group can actually sing this week.

**Drafts persist bhajans, not the seed.** The generator weights by days since
last sung, so once new history is recorded the same seed no longer reproduces
the same set. Storing "seed + template" would have quietly rotted.

`lib/draftGuard.ts` refuses to overwrite any session that already has a singer
or a confirmed pitch, and refuses to replace a published session at all. It is
pure and unit-tested rather than buried in the server action.

### Schema changes in Phase 2

Both additive, both applied to the live database, **and the Phase 0 gate was
re-run after each and still passes**.

| Migration | Change | Why |
|---|---|---|
| `20260809020000_template_single_deity` | `SessionTemplate.singleDeity` | Festival mode, generalised beyond Shivaratri (SPEC §4.G). |
| `20260809021000_slot_singer_optional` | `SessionSlot.singerId` nullable; FK `CASCADE` → `SET NULL` | A drafted set has bhajans but no singers until rostering. The FK change also means deleting a singer can never silently take 99 rows of `confirmedPitch` with it. |

---

## Phase 3 — rostering (complete, except instruments)

`lib/rosterScoring.ts` (pure, 34 tests), `lib/rosterQueries.ts`, and
`app/roster/[id]/assign`.

Every score component is normalised to **[0, 1] before weighting**, so the
weights are directly comparable and a coordinator tuning them can predict what
will happen. Greedy assignment by best score, then a local-swap improvement
pass — ample at eleven singers and three slots.

Default weights put `loadBalance` (1.5) and `overdue` (1.2) above `repertoire`
(1.0) deliberately: the problem the spec names is that the same few people sing
every week. They are editable in the UI.

**Shaped by the data.** A singer takes two slots in the same session in 50 of
the 709 historical rows, so "one slot each" is a penalty, not a rule. Session
sizes confirm 3 as the mode (104 of 188), then 4 (59).

**Rules that hold no matter what:**
- Availability is *respected*, not scored — unavailable singers are excluded.
- A **pinned assignment is never re-solved away**, including when that singer
  is unavailable. It warns instead. Silently dropping a human's choice is
  precisely what SPEC §4.C forbids.
- Applying a roster **only ever writes `singerId`**. It cannot reach
  `confirmedPitch`, `historicalRecommendedPitch` or the bhajan.
- Missing data scores **neutral (0.5), not zero**. No reference pitch or no
  comfort centre is absence of evidence, not evidence of a bad fit.
- Only history *before* the session being planned counts toward overdue and
  load balance, so re-rostering an old session cannot see its own future.

The gender-clump penalty is reported honestly when it is outweighed rather
than hidden — a slot can read "would make three of the same voice in a row"
and still be the best available choice.

---

## Phase 4 — redesign (complete; LIGHT theme)

The palette, typography and motion from SPEC §6, applied across every page.
`app/globals.css` holds five tokens and nothing else; `tailwind.config.ts`
exposes them so components never hand-mix colour.

**The app is light**, on Sailavan's call after seeing both. Warm paper ground,
white cards, brass rules and labels. It was built dark first and flipped; the
flip was a change to the `:root` block in `app/globals.css` and nothing else,
because every component reads a SEMANTIC token (`--panel`, `--field`,
`--card-edge`, `--brass-ink`) rather than a raw colour. Flipping back is the
same one-block change.

Two things the flip forced, worth keeping in mind:

- **Brass is not a text colour on white.** `#B08D3F` is ~2.9:1, which fails for
  body copy. `--brass-ink` is the same brass darkened until it passes; brass
  itself stays for fills, rules and marks.
- **`bg-white/[0.03]` is not a panel.** It reads as a raised panel on a dark
  ground and as literally nothing on a light one. That is why the inner-panel,
  field, hover and card-edge colours are all named tokens now. **`--kumkum` appears in exactly one component** — the
Shruti Ladder and the pitch figures. A separate `--warn` exists precisely so
warnings are never tempted to borrow it, and the destructive button variant is
carried by its label and outline rather than colour.

Fonts are loaded with `next/font/google`: Faustina (display), IBM Plex Sans
(UI), IBM Plex Mono with tabular figures (pitches, counts, deltas).

**Accessibility problems in the inherited build, now fixed:** `*:focus-visible`
was set to `outline: none` with nothing put back, which left the app unusable
by keyboard; there was no skip link; controls were 40px. All three addressed,
and `prefers-reduced-motion` is respected.

One orchestrated moment, as the spec asks: after a re-roll the unlocked slots
settle into place in sequence and locked ones stay put.

`/roster/[id]/print` is the music-stand sheet — one page, large mono pitches,
and the deviation **spelled out in words** because it is printed in black and
white and colour cannot carry it there. It is public and read-only, so its URL
is the share link.

---

## Phase 5 — polish (fairness and staleness complete; auth blocked)

`lib/fairness.ts` (pure, 13 tests) and `/fairness`.

Load is a **share of the group mean**, not an absolute count, so flagging
survives a growing group or a changed window. Against the seeded data it reads
Triveni 16 and Anvita 28 as under-used against Ashwin 133 and Sailavan 118, and
states how many slots would bring each to the mean — an action, not a
complaint.

**"Never sung" and "gone stale" are deliberately separate.** A bhajan the group
never knew is a candidate to learn and belongs on the Build page; only lapsed
*known* bhajans are staleness. Staleness is measured over all history rather
than the selected window, so a two-year lapse cannot disappear because the
window is a year.

The deity counts independently corroborate CLAUDE.md: Ganesha is the
most-sung deity at 141, against the 140-of-188 opener habit.

Festival mode works through the existing pieces — the `Festival (Shiva)`
template constrains every slot to one deity, and each singer's festival list is
already part of their repertoire score. It is not weighted *above* their known
list; see OPEN-QUESTIONS.

---

## Instruments, admin, and the edit gate

**Instrument rotation** — `lib/instrumentScoring.ts` (20 tests). Eligibility,
experience, overdue, load balance. No pitch fit and no gender clumping: SPEC
§4.F asks for the singer scoring "simplified".

**Eligibility is data, not code**, keyed by the instrument names the roster
actually uses, and editable at `/admin`. Confirmed with Sailavan 2026-08-09:

- **Chorus Mic** eligibility is the **singer list**.
- **Cymbals (Male)** and **Cymbals (Female)** may be **anyone on the singer
  list** for now — deliberately not gender-split, despite the names, because
  that is what was asked for. Admins can narrow it.

`scripts/seedEligibility.ts` fills these defaults in. It never deletes and
never overwrites, so coordinator edits survive a re-run.

Eligibility is a **preference, not a gate**, for the same reason repertoire is:
the imported lookup named 16 people while **33 have actually played**, so
filtering on it would exclude half the people who really do this.

### A bug the seeder's own output exposed

`SessionInstrument.person` holds **comma-separated** values for the shared
roles — one Chorus Mic cell names the whole chorus in a single string. Deriving
eligibility from history therefore created a "person" literally named
`"Ashwin, Jothsna, Prithvi"`. Now split on commas; the 24 bogus rows were
removed. **The underlying `SessionInstrument` rows are still compound** — that
is faithful to the source and was left alone, but anything reading `person` as
one name must split it. See OPEN-QUESTIONS.

### SECURITY — the edit gate

`middleware.ts` only ever **set** the `edit` cookie when the right `?k=` was
used. It never blocked a direct POST to a Server Action, so hiding a button in
the UI was the only thing between an anonymous visitor and writing to the
database. `lib/requireEdit.ts` now gates **all eleven** mutating actions
server-side. Any new mutating action must call it too.

---

## OPEN-QUESTIONS

The seven questions from §9 of the spec are **answered** — see `docs/SPEC.md`
§9, which is authoritative and now binding. Summary: Ganesha opener and Sai
closer are soft preferences; default session length is 3; singers may be given
bhajans they have never sung; the repeat window is advisory only; Google
sign-in behind a coordinator-maintained email allowlist, singers limited to
their own slots; `Recent Bhajans` is dead and fully derivable; masterlist
reference pitches are authoritative with no local-correction feature.

Still genuinely open, none blocking:

1. **Which duplicate masterlist row should win** for the four conflicting
   titles? Currently first-in-sheet-order. Conservative and logged, but a
   coordinator would know which pitch is actually right. Affects
   `Govinda Harey Gopala Harey`, `Govinda Jai Jai Gopala Jai`,
   `Harey Krishna Harey Krishna Krishna`, and one other.
2. **Should the 10 roster titles absent from the masterlist be reconciled?**
   They are kept as free text on the slot, so nothing is lost, but they cannot
   participate in repertoire, search or pitch prediction until they resolve.
   Several look like near-misses of real masterlist entries.
3. **Do the 12 instrumentalist-only dates count as sessions** for fairness and
   staleness reporting? Currently yes, and they have no singer slots.
4. **Tempo and level are free-text** with roughly a third of the masterlist
   blank. The shape templates need an ordering over tempo. Assumed
   `Slow < Medium Slow < Medium < Medium Fast < Fast` and "unspecified" never
   excluded — to confirm when Phase 2 starts.
5. **Is the comfort range worth keeping as absolute Sa?** As specified it spans
   5–10 semitones per singer and cannot discriminate, because absolute Sa is
   set by the bhajan, not the voice. A band over each singer's *offsets* would
   be tight and would actually catch an unusual proposal. This changes a
   statistic named in SPEC §4.D, so it is logged rather than swapped in.
   Conservative choice taken meanwhile: compute and display the Sa band as
   information, but do not use it to flag anything yet.
6. **How strong should the Ganesha opener be?** Set to 0.85, a little above the
   140/188 (≈0.74) the history shows, on the reasoning that choosing the
   template is itself a request for the shape. One number, easily changed:
   `SOFT_RULE_PREFERENCE` in `lib/sessionBuilder.ts`.
7. **Should the builder default to "only bhajans the group has sung"?** It
   currently defaults to the whole masterlist, which suggests a lot of unknown
   material. That is arguably right — it is how the group learns — but it may
   be the wrong default for the common case of planning next week.
8. **Is a session of entirely new bhajans ever wanted?** Nothing prevents it.
   If not, the generator should cap how many never-sung bhajans land in one
   set, which is a rule nobody has asked for yet.
9. **Should a singer's festival list outrank their known list in festival
   mode?** SPEC §4.G says festival mode "prefers each singer's own festival
   list". Today both count the same in `repertoireScore`. Weighting festival
   entries higher inside a festival session is a small change to
   `lib/rosterScoring.ts`, but it is a preference nobody has stated.
10. **Is the ±35% fairness tolerance right?** `LOAD_TOLERANCE` in
    `lib/fairness.ts`. Over all history it flags 3 singers under and 3 over out
    of 11, which reads as useful rather than noisy — but it is a guess.
11. **`SessionInstrument.person` is compound.** Rows hold values like
    "Ashwin, Jothsna" for the shared roles. Faithful to the spreadsheet, but it
    means per-person instrument counts are wrong unless split. Normalising into
    one row per person would be a data migration over 424 rows — correct, but
    it rewrites imported history, so it is logged rather than done.
12. **Cymbals (Male)/(Female) are not gender-split.** The names say Male and
    Female; the instruction was "anyone in the singing list, for now". Followed
    literally, and admins can narrow each list. Worth revisiting.
13. **Should the roster page show the Shruti Ladder inline?** SPEC §4.D asks
    for it "on the singer page, the bhajan page, and inline in the roster". It
    is on the first two. The roster grid is dense and a 24-row ladder per slot
    would overwhelm it; a compact variant is probably wanted, which is a design
    decision rather than a bug.
14. **Should the phone's BACK gesture be guarded too?** The unsaved-changes
    dialog catches links; back is a `popstate`, which can only be intercepted
    by pushing a sentinel history entry and re-pushing it on the way past — a
    pattern that strands people on a page when it goes wrong. Conservative
    choice: not guarded. The draft kept on the device makes going back
    recoverable, which is the outcome that actually matters.

### Push notifications — DONE, plus the day-of nudge

Sailavan, 2026-08-10: installed as a PWA on phones, the app should notify
people when a **new session is created**, and especially when **they have been
rostered for it**. Built and confirmed working on a real device.

Four kinds now, all defined in `lib/notify.ts` (pure, 35 tests):

| Kind | When | Alerts? |
|---|---|---|
| `rostered` | you are put on a future session | yes |
| `published` | the roster for a day is up — everyone else | no, silent |
| `nudge` | 3pm on the day, your row still has no bhajan and/or no pitch | yes |
| `nudge_final` | 5pm the same day, still not filled in. The last one. | yes |

The nudge was asked for on 2026-08-12: *"if a singer hasn't put in their song
and confirmed pitch by the day of the session they are allocated for, maybe by
3pm, send them an additional notification asking them to update the song +/-
pitch based on what's missing"*. Sailavan chose 3pm-then-5pm over a single
reminder.

**How the clock reaches the app.** Nothing else in this codebase runs on a
timer — every other notification is triggered by somebody saving something.
`.github/workflows/nudge.yml` fires hourly and POSTs `/api/nudges/run` with a
bearer secret; `runNudges()` decides whether that hour is 3pm or 5pm *in
Melbourne*. Deciding in the app rather than in the cron expression is what
keeps daylight saving out of the workflow file — Melbourne is UTC+10 for half
the year and UTC+11 for the other half, and 3pm has to mean 3pm in the hall on
both sides of the change. It also makes a late or duplicated tick harmless.

Requires two GitHub secrets (`NUDGE_URL`, `NUDGE_SECRET`) and `NUDGE_SECRET`
as an App Service setting. Without them the workflow exits 0 doing nothing and
the endpoint answers 503 — an unauthenticated route that can push to
everyone's phone is not something to leave open by default.

**The hours are configurable, and there is now an Owner.** Added 2026-08-12,
after: *"in case there are sometimes morning sessions he can reconfigure the
rules for certain days/sessions… the majority of sessions are PM, but sometimes
they can be AM."*

`Role` gained `owner` — an editor plus one capability, `manageNotificationRules`.
Running the roster and deciding when a dozen phones buzz are different kinds of
power, so it did not go to every editor. Sailavan holds it; nobody else does.
Set it from Admin → the access dropdown.

`NotificationRule` resolves most-specific-first: this session, then its weekday,
then the default (3pm/5pm, unchanged). A scope that is present and DISABLED
stops resolution rather than falling through — switching Sundays off has to mean
off, which is why `enabled` is a column and not just the row's absence.
Admin → Notifications, owner only.

Watch out for two things that bit during this change:

- `canSeePage` read `role === "editor"`, which locked owners out of every page
  an editor can see. It is keyed off `viewAllPages` now. Same fix in Nav and
  middleware. This is the failure that adding a role ABOVE editor invites, and
  `tests/ownerRole.test.ts` pins it.
- The capability matrix moved to `lib/capabilities.ts` because `lib/auth.ts`
  imports next-auth at module load, which cannot run under vitest — the one
  part of authorisation worth testing had no tests. `lib/auth.ts` re-exports
  everything, so nothing else changed.

Notification copy is time-aware now: "this morning" before 11, "today" before
3pm, "tonight" after. A 7am reminder saying "tonight" is the kind of small
wrongness that makes people stop reading them.

**The quiet notice waits for the roster to settle.** It used to be sent from
the save, and Sailavan caught it announcing "1 singer rostered" when three were
on: the timestamps showed it went out three seconds after the FIRST singer was
added, while he was still typing, and the once-per-person rule meant nobody
received a corrected one. Adding singers one at a time is the normal workflow,
so the count was wrong nearly every time.

`lib/announceRosters.ts` now sends it from the hourly job, once a session's
rows have been unchanged for `SETTLE_MINUTES` (20). Nobody is waiting for a
silent notice addressed to people who are not singing — it can afford to be
late, it cannot afford to be wrong. The alerting "you are rostered" is still
immediate, because it asks somebody to act and it names their own rows, so it
is right the moment it is sent.

**Not repeated.** `SessionNotice` already existed with a unique key on
(session, singer, kind); the two new enum values reuse it, so the once-each
guarantee came for free with no new table. A notice is written even when the
person has no subscribed device, so they are not retried every hour. Both the
3pm and 5pm messages carry the same `tag`, so the second replaces the first in
the shade rather than stacking under it.

**Verified 2026-08-12** against the real roster by forcing the clock: 2pm and
9pm skip; 3pm finds the one incomplete row (`due:1`) and finds nothing on a
second run in the same window; 5pm sends the final one to the same person and
then nothing. The complete row was never nudged. The temporary slot and the
two notices it produced were deleted afterwards — session back to 1 slot.

Original notes, kept because they explain the shape:

- Needs the Web Push API + a service worker, VAPID keys, and a
  `PushSubscription` per person per device. Azure App Service can serve it; no
  extra managed service is required.
- It depends on **named sign-in**. A notification has to reach a person, and
  until Google auth lands the app cannot tell two members apart.
- iOS only permits Web Push for a site the user has added to the Home Screen,
  so the PWA manifest and install prompt come first.
- "Rostered for that session" is knowable the moment `applyAssignments` writes
  `singerId`, which is the natural trigger point.

### The repertoire model, 2026-08-12

`festival` used to be a value of `RepertoireKind`, so a bhajan somebody does at
festivals AND knows appeared twice on their page — 72 of 413 (singer, bhajan)
pairs were doubled. Being a festival bhajan describes the SONG; wanting to
learn it, learning it and knowing it are stages, and a song is at one of them.
So `SingerRepertoire.isFestival` is a flag and there are three stages. The
`festival` enum value is dead and no row carries it.

**The roster feeds the lists.** 388 of the 512 (singer, bhajan) pairs that had
actually been sung were on nobody's list. `scripts/mergeRepertoire.ts` (one-off,
already run) backfilled them as `known` with the pitch last sung, and
`lib/repertoireFromHistory.ts` keeps it true for every session saved since —
including the historical ones being typed in. It never downgrades a stage and
never overwrites a pitch somebody chose.

### Sessions carry more than a date now

`categoryId` (a table the group owns, four seeded), `topic`, and `startsAt` as
"HH:MM" — a time of day, not an instant, so no zone can shift it. All 214
existing sessions were set to 19:00, which is a DEFAULT AND NOT A FACT; the SQL
to change them all is at the bottom of `scripts/seedSessionMeta.ts`.

`Session.date` is **no longer unique** — some days have three sessions.

**Which one does "Thursday" mean?** The evening one. `lib/sessionsOfDay.ts` is
the single answer: `defaultSessionOf` picks the session closest to 19:00, ties
going to the earlier. Not the first of the day, which is what the code briefly
did and which would have handed a 9am festival session every link meant for the
usual 7pm. Used by the landing page, "go to date" in Assign, copy-rows-to-a-day
and `/api/roster/ensure`.

**Nothing is hidden behind that default.** The calendar cell draws one bar per
session, the day panel lists each with its own time, kind, rows and links, and
Assign shows a pill row for the day's sessions when there is more than one.
Tapping a day with several no longer navigates — there is a choice to make, so
it is made visible. "Add another session on this day" is the only way a second
session is created, deliberately separate from tapping.

`/api/roster/ensure` creates sessions and had **no capability check at all**;
it requires `buildSessions` now.

### Correcting the masterlist

`BhajanFieldEdit` holds one row per (bhajan, field) the group has changed, with
`sourceValue` = what the MASTERLIST said, written on the first edit only. So
correcting a correction does not lose the original, and any field can be put
back. Editable fields are whitelisted in `lib/bhajanFields.ts` — `deity` is
deliberately absent because it is denormalised into join tables that every
filter queries, and editing the raw string would leave the two disagreeing.

### Saving twice in a row (fixed 2026-08-13)

Reported as: pressing **Save changes** sometimes gave "An error occurred in the
Server Components render." Reproduced exactly on the old build — first save
fine, second save HTTP 500 and that banner, and the second change never
reached the database.

Two faults, one symptom.

1. **The grid clashed with its own writes.** Its rows live in client state,
   seeded once by a `useState` initialiser, and each row carries the
   `updatedAt` it had at page load so a stale tab cannot overwrite somebody's
   `confirmedPitch`. Nothing gave the grid the NEW stamps after a save, so the
   second press sent the load-time values and the optimistic-concurrency check
   correctly refused them. `revalidatePath` does not help: the component stays
   mounted, so the initialiser never re-runs. A new row also kept its `new_…`
   id and would have been inserted a second time.
   `upsertSessionSingerRows` now returns the saved ids and stamps in position
   order and the grid takes them.
2. **The refusal never said any of this.** Next replaces the message of
   anything thrown out of a Server Action in a production build. Refusals are
   results now (`SaveRowsResult`), not exceptions — the genuine two-people-at-
   once case shows its real sentence, verified with two browser contexts.

Worth remembering: any Server Action whose failure a person needs to read must
RETURN the reason. Throwing is for faults nobody can act on.

### Unsaved work in the roster grid (2026-08-13)

Sailavan asked whether leaving a page with unsaved edits should ask first, and
show what those edits are. It should — but a dialog alone answers the least
important third of the problem, so this is three mechanisms:

| How the work gets lost | What now happens |
|---|---|
| A link inside the app | Our own dialog, listing every change, with Save / Discard / Stay |
| Closing or reloading the tab | The browser's generic prompt. Its wording is not ours to set and it cannot offer a Save button |
| The phone locking, Safari dropping the tab | Nothing fires at all — so the edits are on the device, and offered back on return |

The third is the likeliest one in a hall and the only one no dialog can help
with. `lib/rosterDraft.ts` holds all of it as pure functions; 29 tests.

Decisions worth keeping:

- **The draft stores what it was edited FROM**, not just the edits. Without
  that, a stale draft is indistinguishable from somebody else's newer save —
  both merely differ from what is on screen — and restoring reinstates an old
  pitch over a fresh one. The first version did exactly that and the browser
  test caught it. A draft without that record is refused rather than guessed at.
- **A row the draft changed AND somebody else has since saved keeps the saved
  version**, and says what the draft wanted. CLAUDE.md rule 6: a confirmedPitch
  exists nowhere else.
- **A tabla that merely followed its pitch is not a second change.** Tabla
  pitch is Sa + 7 semitones, so one edit was reading as "2 unsaved changes",
  which makes the count worthless. `describeChanges` takes the app's own
  pitch→tabla map and stays silent when the tabla simply followed.
- **Read the draft before writing it.** A page opens with nothing unsaved, so
  the writer's first act would otherwise be to clear the draft it was meant to
  offer. The effects are ordered deliberately.
- **No autosave.** Saving runs the notification stack — removals, the settled
  announcement — so autosaving would ping the group on every keystroke.

Not covered: the phone's BACK gesture. Intercepting it means pushing history
entries and re-pushing on popstate, which breaks navigation when it goes wrong.
The draft makes going back recoverable instead. Logged under OPEN-QUESTIONS.

### The page slid sideways on every phone (found on the way, 2026-08-13)

At 375px the document was 404px wide, so every screen drifted under the thumb —
and `position: fixed` is placed against that wider viewport, which is how a
centred dialog ends up half off screen.

Two `min-width: auto` defaults, which is what a flex or grid child gets unless
told otherwise: `app/layout.tsx`'s content column, and `Card` itself. Neither
would shrink below the widest thing inside it — the roster table declares
`min-w-[720px]` on purpose — so instead of the table scrolling in its own box,
the page grew. `min-w-0` on both. Measured 404 → 392 → 375, and desktop is
unchanged.

### Also worth knowing

- `data/roster.xlsx` was replaced with the newer export from `~/Downloads`
  (1,926,870 bytes, replacing 1,863,345 — the old one had only 500 roster rows
  against the current 709). The previous file remains in git history at
  `75a48fe^`.
- Local Node is v26 while the Web App runs Node 22. Not currently a problem,
  but a clean local build is not proof the deploy will work.
- `.env.save` was in `main`'s history before being untracked. Whatever it
  contained should still be treated as compromised and rotated. Its contents
  were never read.

# PROGRESS

Running log for the v2 rebuild. **Assume the reader has no memory of previous
sessions** and only has `CLAUDE.md`, `docs/SPEC.md`, this file, and the code.

Updated after every phase: what is done, what is next, decisions and why, and
open uncertainties.

---

## Current state

**Branch:** `v2` (branched from `main` @ `0788398`), **not yet pushed** — see
[Blocked](#blocked).
**Phase:** **Phases 0–5 are complete and green.** What remains needs Sailavan —
see [Next](#next).

The database is seeded and live. `npm run build`, `npm run lint` and
`npm run test:run` are all clean: **187 tests, 1 skipped** (the skip is the
database-backed gate, which skips only when `DATABASE_URL` is absent).

**The Phase 0 gate has been re-run after every schema change since and still
reproduces the CLAUDE.md offset table exactly.** If it ever fails, stop and
report it — do not adjust the expected values.

### Blocked

- **`gh` token is missing the `workflow` scope**, so pushing `v2` is rejected:
  `refusing to allow an OAuth App to create or update workflow ...`. Fix with
  `gh auth refresh -s workflow`, then `git push -u origin v2`. Everything else
  is committed locally; nothing is lost by the delay.
- SPEC §7 says "ship each phase to production before starting the next." That
  needs `v2` merged to `main`, which triggers the deploy workflow. Until the
  push above happens, no phase has been shipped. Phases are being built in
  order regardless.

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

1. **Push `v2`.** Still blocked on `gh auth refresh -s workflow`. Twenty
   commits are local and nothing has been deployed.
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

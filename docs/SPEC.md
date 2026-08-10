# Naimisha Bhajan Roster — Product Spec (v2)

Companion to `CLAUDE.md`. That file holds the invariants and the data model.
This one holds the product.

---

## 1. The problem

A spreadsheet can store what happened. It cannot answer the three questions the
group actually has each week:

- *What should we sing this Sunday?* — 3,613 bhajans, and the group reaches for
  the same few dozen.
- *Who should sing it?* — fairness, variety, and who actually knows the song.
- *What pitch does this person need?* — the masterlist gives one reference per
  gender, but every singer sits somewhere off it, consistently.

v1 built the record-keeping. v2 builds the answers.

## 2. The insight worth building around

There are 611 historical rows where both the recommended pitch and the pitch
actually sung are known. **They disagree in 381 of them** — and the disagreement
is not noise. Each singer has a stable personal offset:

- Prithvi sings **+1 to +2 semitones** above the Gents reference (median +1,
  72 of 89 rows at +1 or +2).
- Sailavan sits at **+1** (53 of 99 rows).
- Anvita sits **at or below** the Ladies reference (median 0, mean −0.52).

So the app can stop showing a generic reference and start showing *this singer's*
pitch for *this bhajan*, predicted before they have ever sung it. That is the
feature nothing else does, and it should be the spine of the product.

## 3. Users

| Who | Needs |
|---|---|
| **Roster coordinator** (Sailavan) | Build a session in under five minutes. Override anything. See who is being under-used. |
| **Singer** | See what they're singing, at what pitch, with lyrics and meaning, on a phone. Flag a pitch that didn't sit right. |
| **Instrumentalist** | See the tabla pitch per slot and who is on which instrument. |
| **Anyone in the centre** | Read-only view of the upcoming session. |

---

## 4. Modules

### A. Bhajan Library

Browse and search 3,613 bhajans.

- Full-text search over title, lyrics, meaning, glossary terms. Use Postgres
  `tsvector` with a GIN index, not `LIKE`.
- Facets: deity, language, raga, beat, level, tempo, tags, and presence flags
  (has audio / lyrics / sheet music / tutorial / video / karaoke track).
- Every facet has an explicit **"unspecified"** option. Roughly a third of the
  masterlist is missing tempo or level; those bhajans must remain reachable.
- Detail page: lyrics, meaning, both reference pitches, raga, beat, embedded
  audio, links out to sheet music and tutorials, and — new — **who in the group
  has sung it, when, and at what pitch.**

### B. Session Builder — the suggestion engine

The headline feature. Produce a set of *n* bhajans (**default 3**, confirmed in
§9.2) that works as a session, not just *n* rows that pass a filter.

**Inputs**

- Session date, session length, session type (Weekday / Sunday / Festival).
- Filter set: any facet from the library, multi-select, include or exclude.
- **Freshness**: down-weight and flag anything sung in the last *N* days
  (default 90) — **advisory, never exclusionary** (§9.4). Invertible to
  "revisit things we've let go stale."
- **Repertoire mode**: an opt-in toggle, **default off** (§9.3). When off,
  repertoire only scores; unknown bhajans stay eligible.
- **Shape template** (see below).
- Seed. Store it. A generated set must be reproducible and shareable by URL.

**Shape templates** — this is what separates a session from a shuffle.

A template is an ordered list of slot rules. Every rule carries a strength:
`hard` (a candidate violating it is rejected) or `soft` (violation is
down-weighted and surfaced, never fatal). `Standard`:

| Slot | Rule | Strength |
|---|---|---|
| 1 | Deity = Ganesha. Tempo ≤ Medium. | **soft** (§9.1) |
| 2 | Tempo Slow or Medium Slow. Deity ≠ slot 1. | soft |
| 3–(n−2) | Free, subject to diversity constraints. Tempo trends upward. | soft |
| n−1 | Tempo Medium Fast or Fast. | soft |
| n | Deity includes Sai. | **soft** (§9.1) |

Ship `Weekday (3)` — **the default**, per §9.2 — plus `Standard` and `Festival`
(all slots constrained to one deity; the single-deity rule here *is* `hard`).
Templates are data, editable in the UI — do not hard-code them. The Ganesha
opener and Sai closer are confirmed as strong habits rather than rules (§9.1):
weight them, never enforce them.

**Diversity constraints**, applied across the whole set:

- No repeated raga. *(hard)*
- No more than 2 bhajans per deity, and at least 4 distinct deities. *(hard;
  relaxed automatically when n < 4, which is the common case now that the
  default length is 3 — with 3 slots this reduces to "no repeated deity".)*
- At least 2 languages if the filters allow it. *(soft)*
- Bhajans sung in the last *N* days are down-weighted and flagged, **not
  removed** (§9.4). *(soft)*
- Tempo sequence is weakly non-decreasing across the middle slots. *(soft)*

**Algorithm.** Do not over-engineer this. Weighted random sampling with
rejection, seeded PRNG, is enough:

1. Filter the masterlist to the candidate pool. If the pool is smaller than
   3 × *n*, surface a warning naming which filter is doing the damage.
2. Weight each candidate: `w = freshness × novelty × completeness`, where
   *freshness* rises with days since last sung, *novelty* favours bhajans the
   group has sung fewer times, and *completeness* mildly favours bhajans with
   lyrics, audio, and a reference pitch.
3. Fill slots in order, sampling without replacement, rejecting candidates that
   violate a slot rule or a diversity constraint. Backtrack up to *k* times per
   slot, then relax the softest constraint and record that it was relaxed.
4. Return the set plus a per-slot **reason string** ("Ganesha opener, not sung
   since Jan 2026").

**Interaction**

- Lock any row; re-roll only the unlocked ones.
- Swap a single row for the next-best candidate.
- Manual search-and-insert into any slot.
- Drag to reorder.
- **Always show why.** A generated list nobody understands is a list nobody
  trusts. Show the relaxed-constraint warnings honestly.

### C. Roster — assigning singers

Once the bhajans are chosen, assign a singer to each slot.

**Score every (singer, slot) pair** and solve as an assignment problem. Greedy
by best score plus a local-swap improvement pass is sufficient at this scale;
the Hungarian algorithm is available if it's genuinely needed. Score:

```
score = w1·repertoire   // already sung it, or on their known/festival list
      + w2·overdue      // days since this singer last sang anything
      + w3·loadBalance  // their 90-day count vs the group mean, inverted
      + w4·pitchFit     // 1 / (1 + |predictedPitch − theirComfortMedian|)
      + w5·variety      // penalise repeating a bhajan they sang recently
      − w6·genderClump  // penalise 3+ consecutive same-gender slots
```

Weights live in config and are tunable from the UI by the coordinator. Every
assignment carries a one-line explanation. Every assignment is overridable, and
an override must never be silently re-solved away.

**Availability**: singers can be marked unavailable for a date. Respect it.

**Per-slot output**: singer, bhajan, predicted pitch, tabla pitch (Sa + 7),
raga, beat, and a link to lyrics.

### D. Pitch Intelligence

The differentiator. All of it derives from `semitoneDelta` in `CLAUDE.md`.

**Per singer:**

- Offset profile: median and distribution of their delta from the gender
  reference, overall and — where there are ≥ 5 data points — per raga.
- **Predicted pitch** for any bhajan they have never sung:
  `reference(their gender) + medianOffset`, snapped to the nearest label in the
  same series as the reference. Show it as a prediction, with the sample size
  behind it. Under 5 data points, show the plain reference and say so.
- **Comfort range**: the p10–p90 band of their historical Sa. Flag any proposed
  pitch outside it before the session, not after.
- Repertoire: what they know, what they've sung, what's gone stale.

**Per bhajan:** who has sung it, at what pitches, spread against both references.

**The signature view — the Shruti Ladder.** A vertical chromatic ladder of the
24 pitch labels. Reference pitch marked in ivory. The singer's actual or
predicted pitch marked in kumkum red. The gap between them is the whole product,
made visible in one glance. This element should appear on the singer page, the
bhajan page, and inline in the roster.

### E. History & fairness

- Session archive, filterable, with a calendar view.
- Counts: per bhajan, per singer, per deity, per raga — over a selectable window.
- **Under-used and over-used singers** at a glance. Prasanna has 67 slots,
  Triveni 16; that is the kind of thing the app should make impossible to miss.
- Staleness: bhajans the group knows but hasn't sung in over a year.

### F. Instruments

Harmonium, Chorus Mic, Tabla, Cymbals (Male), Cymbals (Female), Tambourine,
Ghanjira. Eligibility comes from the lookup table. Same fair-rotation scoring as
singers, simplified. Show the tabla pitch per slot — it changes with the bhajan.

### G. Festival mode

Each singer has a curated festival list (currently Shiva bhajans, from the
`Festival Bhajans` sheet). Festival mode constrains the whole session to one
deity and prefers each singer's own festival list. Should generalise to any
festival, not just Shivaratri.

### H. Sharing and export

- Public read-only session URL, no login.
- Print / PDF view of the roster sheet — one page, legible at arm's length on a
  music stand.
- Add-to-calendar for the session date.
- Optional: a plain-text block formatted for pasting into WhatsApp. Ask before
  building this; it may be exactly how the group already communicates.

### I. Auth and roles

**Phase 1** — keep the existing `EDIT_KEY` cookie mechanism. It works and costs
nothing. Two changes: add a lightweight "who are you?" singer picker stored in a
cookie so edits can be attributed, and remove the tracked `.env.save` from git.

**Phase 2** — named sign-in via **Auth.js with the Google provider**, gated by a
coordinator-maintained **email allowlist** mapping each address to a `Singer`
and a role (§9.5). Three roles: coordinator (full edit), singer (edit **only
their own slots** — confirmed pitch and availability), viewer (anonymous, read
only). Sign-in never auto-creates a singer; an unlisted address gets viewer
access. Lands in roadmap Phase 5.

---

## 5. Data model changes from v1

Keep the Prisma foundation. Change:

| Change | Why |
|---|---|
| `SessionSinger` → `SessionSlot`, `slot` → `position Int` (required) | Slots are ordered. Order carries meaning. |
| Drop `recommendedPitch`, `raga`, `lyrics`, `meaning` from the slot | All derivable from the bhajan. Duplicated state drifts. |
| Add `Session.type`, `Session.templateId`, `Session.seed`, `Session.status` | Reproducible generation; draft vs published. |
| New `SingerRepertoire { singerId, bhajanId, kind: known\|festival }` | Currently trapped in two wide sheets. |
| New `SingerAvailability { singerId, date, available }` | Rostering needs it. |
| New `SessionTemplate` + `SlotRule` | Templates as data, not code. |
| Normalise `deity` and `songTags` into join tables | 21 deities, 151 tag combos, currently comma-strings. |
| `PitchLookup` → `PitchLabel`, add `semitone Int`, `series` enum | Make the pitch math a first-class column. |
| Add `tsvector` + GIN index on Bhajan | 3,613 rows searched on every keystroke. |
| Sessions and singers get `createdBy` once auth lands | Attribution. |

Write a real migration. Do not reset and re-seed in production — the 709
historical rows are the asset, and `confirmedPitch` values exist nowhere else.

---

## 6. Design direction

The brief is: *far more refined and sophisticated*. Concretely, that means the
app should look like it belongs to the tradition it serves, not like a generic
dashboard with saffron accents.

**Ground it in the instruments.** The visual world here is a harmonium — ivory
and ebony keys, a lacquered rosewood case, aged brass reed plates — a shruti
box, and a numbered pitch ladder. That ladder is already the app's core concept.
Let it be the visual signature too.

**Palette** — 5 tokens, no more:

| Token | Role | Direction |
|---|---|---|
| `--ink` | Ground | Deep lacquered indigo-black, near `#12141C` |
| `--ivory` | Surface / key white | Warm off-white, near `#EFEAE1` |
| `--brass` | Primary accent, structure | Aged brass, near `#B08D3F` |
| `--kumkum` | **Reserved for pitch deviation only** | Deep vermilion, near `#B33A3A` |
| `--muted` | Secondary text, rules | Desaturated slate |

Reserving kumkum for one meaning is the discipline that makes the ladder read
instantly. Do not use it for buttons, errors, or decoration.

**Typography** — three roles, deliberately paired:

- Display (bhajan titles, page headers): **Faustina** — a warm, slightly
  calligraphic serif with strong diacritic coverage for transliterated Sanskrit.
- UI and body: **IBM Plex Sans**.
- Pitch labels, counts, semitone deltas: **IBM Plex Mono**, tabular figures.
  Numbers that shift width while re-rolling look broken.

**Avoid the default.** Do not build the cream-background / high-contrast-serif /
terracotta-accent look. It is the current house style of AI-generated design and
it will read as templated no matter how well executed. If a warmer direction is
wanted, argue for a specific one from the harmonium's own materials.

**Motion**: one orchestrated moment — the re-roll, where unlocked slots settle
into place in sequence while locked ones stay put. Everywhere else, restraint.
Respect `prefers-reduced-motion`.

**Mobile first, genuinely.** The roster is read on a phone, in a hall, standing.
375px is the design target, not the fallback. Large tap targets, high contrast,
lyrics readable without pinching.

**Two densities**: a dense coordinator view (tables, everything visible) and a
calm singer view (one slot at a time, big type).

---

## 7. Roadmap

**Phase 0 — foundation.** Migrate the schema. Rewrite the seed with the fixes in
`CLAUDE.md`. Add vitest. Port the pitch math into `lib/pitch.ts` with the
singer-offset table as a regression test. Confirm the numbers reproduce.

**Phase 1 — pitch intelligence.** Offset profiles, predicted pitch, comfort
ranges, the Shruti Ladder component. Wire it into the existing singer and bhajan
pages. *This is the phase that makes the app worth using; do it before the
redesign.*

**Phase 2 — session builder.** Filters, shape templates, seeded generation,
lock/re-roll, save as draft session.

**Phase 3 — rostering.** Scoring, assignment, availability, overrides,
explanations, instruments.

**Phase 4 — redesign.** Apply the design direction across everything. Print view.
Public share links.

**Phase 5 — polish.** Festival mode, fairness dashboards, staleness reports,
named auth.

Ship each phase to production before starting the next.

---

## 8. Non-goals

- No audio playback engine — link out to existing recordings.
- No transposition of audio files.
- No notation rendering. Link to the existing sheet music.
- No native mobile app. A good responsive web app, installable as a PWA at most.
- No multi-tenant support for other centres until Naimisha is happy.

---

## 9. Answered questions

Answered by Sailavan, 2026-08-09. These are now binding; where they contradict
an earlier section of this spec, **this section wins** and the earlier section
has been amended to match.

**1. Is the Ganesha-opener a rule or just a strong habit? Same for the Sai
closer.**

> Strong habit. The Sai closer is not a rule.

Both are **soft preferences, not hard constraints**. The generator should
weight a Ganesha bhajan heavily in slot 1 and a Sai bhajan in the final slot,
but must never fail to produce a session because neither is available, and must
never reject a coordinator's manual choice. Slot rules therefore need a
`hard | soft` flag; the `Standard` template's opener and closer are `soft`.

**2. Is 10 the right default?**

> No, 3 is the right default session length.

**Default session length is 3.** The `Weekday (3)` template becomes the default
template rather than a variant. Longer sets (Sunday, festival) are explicitly
chosen, not the norm. Anywhere this spec previously said "default 10", read 3.

**3. Should a singer ever be assigned a bhajan they have never sung?**

> Yes, that should be allowed.

Repertoire is a **scoring input, not a filter**. `w1·repertoire` rewards a
known bhajan; it never excludes an unknown one. "Restrict to known repertoire"
stays available as an opt-in toggle, defaulting to off. This is also what makes
predicted pitch matter — an unsung bhajan is exactly the case where the
singer's offset profile is the only guide.

**4. What is the real "don't repeat within" window?**

> Don't repeat within is not a hard stop, just a recommendation or flag.

Freshness is **advisory**. Keep the 90-day default as the threshold for
*flagging*, but a recently-sung bhajan is never removed from the candidate pool
— it is down-weighted and shown with a visible "sung 3 weeks ago" marker. The
coordinator decides. The window is user-adjustable.

**5. Who should be able to edit?**

> Coordinators only, singers for their song alone. Can it use their Google
> account as their authentication? We can provide a list of emails and assign
> it to the user.

Two roles, plus anonymous read:

| Role | Can do |
|---|---|
| Coordinator | Everything: build sessions, assign, override, edit any slot. |
| Singer | Edit **only their own slots** — confirmed pitch, availability. Read everything else. |
| Viewer (anonymous) | Read-only. No login. |

**Yes, Google sign-in is the right mechanism.** Auth.js (NextAuth) with the
Google provider, gated by an **email allowlist**: a coordinator maintains a list
of email addresses, each mapped to an existing `Singer` row and a role. An
address not on the list gets viewer access only — sign-in never auto-creates a
singer. This replaces the `EDIT_KEY` link, which stays in place until it ships
(see 4.I). Google is a third-party identity provider, not an Azure marketplace
service, so it does not touch the sponsorship grant. Scheduled for **Phase 5**.

**6. Is the `Recent Bhajans` count sheet still maintained by hand?**

> That's just a static count thing we did to see how many bhajans had been sung
> at a point in time, can be fully derived from session history.

Confirmed dead. **Do not import it.** All counts derive from `SessionSlot`.

**7. Are the Gents/Ladies reference pitches ever wrong in the masterlist?**

> For the sake of the app, no.

Treat the masterlist reference pitches as **authoritative**. No local-override
feature, no correction UI. The one historical row that disagrees with the
masterlist is logged at seed time and otherwise ignored. This keeps
`recommendedPitch` purely derived, per `CLAUDE.md` rule 5.

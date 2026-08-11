import Link from "next/link";
import { prisma } from "@/lib/db";
import { SessionType } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import { getCandidatePool, getFacetOptions, getSingersForBhajans, UNSPECIFIED } from "@/lib/candidateQueries";
import {
  generateSession,
  DEFAULT_LENGTH,
  DEFAULT_FRESHNESS_DAYS,
  type TemplateSpec,
} from "@/lib/sessionBuilder";
import { saveDraftSession } from "./actions";
import { nextThursday } from "@/lib/dates";
import { DeitySymbols } from "@/components/DeitySymbol";

import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

/** Offered as chips without needing the "Other languages" toggle. */
const PRIMARY_LANGUAGES = ["Sanskrit / Hindi", "English", "Tamil", "Telugu"];

/**
 * Selected when the coordinator has not chosen any language.
 *
 * English is offered but NOT default: the masterlist's English entries are
 * largely translated and Western-devotional pieces the group does not usually
 * sing, so including them by default skewed the suggestions. It is one tap away.
 */
const DEFAULT_LANGUAGES = ["Sanskrit / Hindi", "Tamil", "Telugu"];

const one = (sp: SP, key: string): string | undefined => {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
};

/**
 * Multi-values arrive two ways: a `<select multiple>` submits repeated params,
 * while the lock/re-roll links build comma-joined ones so the URL stays short
 * and readable. Accept both.
 */
const list = (sp: SP, key: string): string[] => {
  const v = sp[key];
  const raw = Array.isArray(v) ? v : v === undefined ? [] : [v];
  return raw
    .flatMap((s) => s.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
};

/** Today in Australia/Melbourne — session dates are Melbourne dates. */
function melbourneToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Build a URL for the same page with some params changed. */
function href(sp: SP, changes: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    // Collapse repeated params to one comma-joined value; `list()` reads both,
    // and losing the extra values here would silently drop filters on re-roll.
    const value = Array.isArray(v) ? v.filter(Boolean).join(",") : v;
    if (value) params.set(k, value);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  // `hash` anchors the result at the slot being acted on. The first click after
  // a page load happens BEFORE React hydrates, so the Link is still a plain
  // <a> and the browser does a full navigation — scroll={false} cannot apply
  // yet, and the page jumped to the top. The anchor makes that first click land
  // in the right place too; afterwards the client transition takes over and
  // nothing scrolls at all.
  const hash = changes.__hash ? `#${changes.__hash}` : "";
  params.delete("__hash");
  return (qs ? `/build?${params.toString()}` : "/build") + hash;
}

export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const role = await getRole();
  if (!can(role, "buildSessions")) return <NoAccess what="Building a session" role={role} />;

  const sp = await searchParams;

  /*
   * Default to the coming Thursday — the group's usual weekday session — rather
   * than to today, which was almost never the date being planned. The date
   * field above stays a free date picker, so any other day is one click away.
   */
  const date = one(sp, "date") ?? nextThursday(melbourneToday());
  const seed = one(sp, "seed") ?? `${date}#1`;
  const freshnessDays = Number(one(sp, "fresh") ?? DEFAULT_FRESHNESS_DAYS) || DEFAULT_FRESHNESS_DAYS;
  /**
   * `lock` is `position:bhajanId` pairs. Keyed by position, because locks that
   * were merely an ordered list got re-placed at 1..n and made a single swap
   * look like it changed the whole set.
   */
  const locked = new Map<number, string>();
  for (const part of list(sp, "lock")) {
    const [pos, id] = part.split(":");
    const n = Number(pos);
    if (Number.isInteger(n) && id) locked.set(n, id);
  }
  const serialiseLocks = (m: Map<number, string>) =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([p, id]) => `${p}:${id}`).join(",");

  /** `pick` is `bhajanId:singerId` pairs — kept in the URL like the locks. */
  const picks = new Map<string, string>();
  for (const part of list(sp, "pick")) {
    const [bhajanId, singerId] = part.split(":");
    if (bhajanId && singerId) picks.set(bhajanId, singerId);
  }
  const serialisePicks = (m: Map<string, string>) =>
    [...m.entries()].map(([b, s]) => `${b}:${s}`).join(",");

  const [templates, facets] = await Promise.all([
    prisma.sessionTemplate.findMany({
      include: { rules: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
    getFacetOptions(),
  ]);

  if (templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No templates yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-on-surface-muted">
          Run <code className="rounded bg-slate-100 px-1">npm run db:templates</code> to insert the
          shipped shape templates, then reload.
        </CardContent>
      </Card>
    );
  }

  const templateName = one(sp, "t") ?? templates[0].name;
  const template = templates.find((t) => t.name === templateName) ?? templates[0];
  const length = Number(one(sp, "n") ?? template.defaultLength) || DEFAULT_LENGTH;

  const spec: TemplateSpec = {
    name: template.name,
    defaultLength: template.defaultLength,
    singleDeity: template.singleDeity,
    rules: template.rules.map((r) => ({
      position: r.position,
      strength: r.strength,
      deity: r.deity,
      tempoIn: r.tempoIn,
      note: r.note,
    })),
  };

  const pool = await getCandidatePool(
    {
      deities: list(sp, "deity"),
      excludeDeities: list(sp, "notdeity"),
      // Default to the languages the group actually sings in. The masterlist
      // has 40, most of them one-offs, and an unfiltered pool kept suggesting
      // Japanese and Zulu. Explicitly clearing the facet still opens it up.
      languages: sp.lang === undefined ? DEFAULT_LANGUAGES : list(sp, "lang"),
      tempos: list(sp, "tempo"),
      levels: list(sp, "level"),
      requireLyrics: one(sp, "lyrics") === "1",
      requireAudio: one(sp, "audio") === "1",
      requireReference: one(sp, "ref") === "1",
      sungBefore: (one(sp, "sung") as "any" | "known" | "new") ?? "any",
    },
    new Date(`${date}T00:00:00.000Z`),
  );

  const result = generateSession(pool, spec, { seed, length, freshnessDays, locked });

  const sessionType: SessionType = template.singleDeity
    ? SessionType.Festival
    : length >= 8
      ? SessionType.Sunday
      : SessionType.Weekday;

  /*
   * Re-roll used to bump a counter: #1 -> #2 -> #3. Every set stayed
   * reproducible, but the SEQUENCE was reproducible too — re-roll a few times,
   * press back, re-roll again, and the identical sets came round in the
   * identical order. It read as "the suggestions cycle".
   *
   * A random suffix fixes that without losing anything: the URL still contains
   * the seed, so any set you land on is still exactly reproducible and
   * shareable. Only the ORDER you meet them in stops being predetermined.
   */
  const seedBase = seed.includes("#") ? seed.slice(0, seed.lastIndexOf("#")) : seed;
  const nextSeed = `${seedBase}#${Math.random().toString(36).slice(2, 8)}`;

  const FILTER_KEYS = ["deity", "notdeity", "lang", "tempo", "level", "lyrics", "audio", "ref", "sung"];
  const activeFilters = FILTER_KEYS.filter((k) => (one(sp, k) ?? "") !== "" && one(sp, k) !== "any").length;
  const clearAllHref = href(
    sp,
    Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])) as Record<string, undefined>,
  );

  const chosenIds = result.slots.map((s) => s.candidate.id);
  const [singersByBhajan, allSingers] = await Promise.all([
    getSingersForBhajans(chosenIds),
    prisma.singer.findMany({ where: { gender: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, gender: true } }),
  ]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Build a session</CardTitle>
          <div className="mt-1 text-sm text-on-surface-muted">
            {result.poolSize.toLocaleString()} bhajans match the filters. Everything is in the
            URL, so this exact set can be shared or bookmarked.
          </div>
        </CardHeader>

        <CardContent className="grid gap-4">
          <form method="get" action="/build" className="grid gap-3">
            <input type="hidden" name="lock" value={serialiseLocks(locked)} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Session date">
                <input
                  type="date"
                  name="date"
                  defaultValue={date}
                  className="h-10 w-full rounded-[12px] border px-3 text-sm"
                />
              </Field>

              <Field label="Template">
                <select
                  name="t"
                  defaultValue={template.name}
                  className="h-10 w-full rounded-[12px] border px-3 text-sm"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                      {t.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Bhajans">
                <input
                  type="number"
                  name="n"
                  min={1}
                  max={20}
                  defaultValue={length}
                  className="h-10 w-full rounded-[12px] border px-3 text-sm"
                />
              </Field>

              <Field label={`Flag if sung within (days)`}>
                <input
                  type="number"
                  name="fresh"
                  min={0}
                  max={999}
                  defaultValue={freshnessDays}
                  className="h-10 w-full rounded-[12px] border px-3 text-sm"
                />
              </Field>

              <Field label="Repertoire">
                <select
                  name="sung"
                  defaultValue={one(sp, "sung") ?? "any"}
                  className="h-10 w-full rounded-[12px] border px-3 text-sm"
                >
                  <option value="any">Anything in the masterlist</option>
                  <option value="known">Only bhajans the group has sung</option>
                  <option value="new">Only bhajans never sung</option>
                </select>
              </Field>
            </div>
            <details className="rounded-[12px] border border-rule-surface bg-panel">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
                Filters
                {activeFilters > 0 ? (
                  <span className="ml-2 rounded-full border border-brass/50 bg-brass/15 px-2 py-0.5 text-[11px] font-normal">
                    {activeFilters} active
                  </span>
                ) : null}
              </summary>
              <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
                <MultiField
                  label="Deity"
                  name="deity"
                  options={facets.deities}
                  selected={list(sp, "deity")}
                  clearHref={list(sp, "deity").length ? href(sp, { deity: undefined }) : undefined}
                />
                <MultiField
                  label="Language"
                  name="lang"
                  // The four the group actually sings in. The masterlist holds
                  // 40 values, most of them one-off combinations, and offering
                  // all of them buried the useful ones.
                  options={PRIMARY_LANGUAGES.filter((l) =>
                    facets.languages.some((f) => f.name === l),
                  )}
                  moreOptions={facets.languages
                    .map((l) => l.name)
                    .filter((l) => !PRIMARY_LANGUAGES.includes(l))}
                  moreLabel="Other languages"
                  selected={sp.lang === undefined ? DEFAULT_LANGUAGES : list(sp, "lang")}
                  clearHref={list(sp, "lang").length ? href(sp, { lang: "" }) : undefined}
                />
                <MultiField
                  label="Tempo"
                  name="tempo"
                  options={facets.tempos}
                  selected={list(sp, "tempo")}
                  clearHref={list(sp, "tempo").length ? href(sp, { tempo: undefined }) : undefined}
                />
                <MultiField
                  label="Level"
                  name="level"
                  options={facets.levels}
                  selected={list(sp, "level")}
                  clearHref={list(sp, "level").length ? href(sp, { level: undefined }) : undefined}
                />

                <fieldset className="grid gap-1.5">
                  <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
                    Must have
                  </legend>
                  <Check name="lyrics" label="Lyrics" checked={one(sp, "lyrics") === "1"} />
                  <Check name="audio" label="Audio" checked={one(sp, "audio") === "1"} />
                  <Check name="ref" label="Reference pitch" checked={one(sp, "ref") === "1"} />
                </fieldset>

                {/* Excluding a deity is the uncommon case; it does not deserve
                    a second copy of all 21 chips on screen by default. */}
                <details className="self-start">
                  <summary className="cursor-pointer text-xs text-on-surface-muted hover:text-on-surface">
                    Exclude a deity
                    {list(sp, "notdeity").length > 0
                      ? ` (${list(sp, "notdeity").length})`
                      : ""}
                  </summary>
                  <div className="mt-2">
                    <MultiField
                      label=""
                      name="notdeity"
                      options={facets.deities}
                      selected={list(sp, "notdeity")}
                      allowUnspecified={false}
                    />
                  </div>
                </details>

                <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                  {/* Unchecking chips one at a time and pressing Apply was the
                      only way back to an unfiltered pool. This resets them. */}
                  <Link href={clearAllHref} scroll={false}>
                    <Button type="button" className="h-9 text-xs">
                      Clear all filters
                    </Button>
                  </Link>
                  <span className="text-xs text-on-surface-muted">
                    {activeFilters === 0
                      ? "No filters applied."
                      : `${activeFilters} filter${activeFilters === 1 ? "" : "s"} applied — clearing goes back to the whole masterlist.`}
                  </span>
                </div>

                <p className="text-xs text-on-surface-muted md:col-span-2">
                  Every facet offers <strong>not recorded</strong>, for bhajans the masterlist
                  never filled in — a third have no tempo and nearly a third no level. Leaving a
                  facet untouched never drops a bhajan for lacking that field.
                </p>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary">
                Apply
              </Button>
              <Link href={href(sp, { seed: nextSeed })} scroll={false}>
                <Button type="button">Re-roll unlocked</Button>
              </Link>
              {locked.size > 0 ? (
                <Link href={href(sp, { lock: undefined })} scroll={false}>
                  <Button type="button">Unlock all</Button>
                </Link>
              ) : null}
              <span className="font-mono text-xs text-on-surface-muted">seed {seed}</span>
            </div>
          </form>

          {result.warnings.length > 0 ? (
            <div className="rounded-[12px] border border-warn/60 bg-warn/10 p-3">
              <div className="text-sm font-semibold">Worth knowing</div>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* The set */}
          <ol className="grid gap-2">
            {result.slots.map((slot) => {
              // Swap: pin every OTHER slot where it already is, then re-roll.
              const otherLocks = new Map(
                result.slots
                  .filter((x) => x.position !== slot.position)
                  .map((x) => [x.position, x.candidate.id] as const),
              );
              return (
                <li
                  key={slot.candidate.id}
                  // SPEC §6: one orchestrated moment. Unlocked slots settle into
                  // place in sequence after a re-roll; locked ones stay put and
                  // carry no animation. `prefers-reduced-motion` disables it.
                  id={`slot-${slot.position}`}
                  className={`scroll-mt-4 rounded-[12px] border border-rule-surface bg-panel p-3${slot.locked ? "" : " settle"}`}
                  style={slot.locked ? undefined : { animationDelay: `${(slot.position - 1) * 70}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-on-surface-muted">
                          {String(slot.position).padStart(2, "0")}
                        </span>
                        {slot.locked ? (
                          <span className="rounded-full border px-2 py-0.5 text-[10px]">locked</span>
                        ) : null}
                        {slot.recentlySung ? (
                          <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px]">
                            sung recently
                          </span>
                        ) : null}
                      </div>
                      <Link
                        href={`/bhajans/${slot.candidate.id}`}
                        className="mt-1 flex items-center gap-2 font-medium underline-offset-2 hover:underline"
                      >
                        <DeitySymbols deities={slot.candidate.deities} size={19} />
                        {slot.candidate.title}
                      </Link>
                      <div className="mt-1 text-xs text-on-surface-muted">
                        {[
                          slot.candidate.deities.join(", ") || "deity unspecified",
                          slot.candidate.raga ?? "raga unspecified",
                          slot.candidate.tempo ?? "tempo unspecified",
                        ].join(" · ")}
                      </div>
                      <div className="mt-1 text-xs" style={{ color: "rgb(var(--muted))" }}>
                        {slot.reasons.join(" · ")}
                      </div>
                      {slot.relaxed.length > 0 ? (
                        <div className="mt-1 text-xs font-medium text-on-surface">
                          Relaxed to fill this slot: {slot.relaxed.join(", ")}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col gap-1">
                      <Link
                        scroll={false}
                        href={href(sp, {
                          lock: (() => {
                            const next = new Map(locked);
                            if (slot.locked) next.delete(slot.position);
                            else next.set(slot.position, slot.candidate.id);
                            return serialiseLocks(next) || undefined;
                          })(),
                        })}
                      >
                        <Button type="button" className="w-full text-xs">
                          {slot.locked ? "Unlock" : "Lock"}
                        </Button>
                      </Link>
                      <Link
                        href={href(sp, {
                          lock: serialiseLocks(new Map(otherLocks)),
                          seed: nextSeed,
                          __hash: `slot-${slot.position}`,
                        })}
                        scroll={false}
                      >
                        <Button type="button" className="w-full text-xs">
                          Swap
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Who can sing this — pick one now, or leave it to rostering. */}
                  <SingerPicks
                    candidates={singersByBhajan.get(slot.candidate.id) ?? []}
                    allSingers={allSingers}
                    picked={picks.get(slot.candidate.id) ?? null}
                    hrefFor={(singerId) => {
                      const next = new Map(picks);
                      if (singerId === null) next.delete(slot.candidate.id);
                      else next.set(slot.candidate.id, singerId);
                      return href(sp, { pick: serialisePicks(next) || undefined });
                    }}
                  />
                </li>
              );
            })}
          </ol>

          {result.slots.length > 0 ? (
            <form action={saveDraftSession} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="date" value={date} />
              <input type="hidden" name="seed" value={seed} />
              <input type="hidden" name="templateId" value={template.id} />
              <input type="hidden" name="type" value={sessionType} />
              <input
                type="hidden"
                name="slots"
                value={JSON.stringify(
                  result.slots.map((s) => ({
                    id: s.candidate.id,
                    title: s.candidate.title,
                    singerId: picks.get(s.candidate.id) ?? null,
                  })),
                )}
              />
              <Button type="submit" variant="primary">
                Save as draft session on {date}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-on-surface-muted">{label}</span>
      {children}
    </label>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} value="1" defaultChecked={checked} className="h-4 w-4" />
      {label}
    </label>
  );
}

/**
 * A multi-select rendered as a comma-joined text value so the whole generator
 * state stays in one shareable URL.
 */
function MultiField({
  label,
  name,
  options,
  selected,
  allowUnspecified = true,
  clearHref,
  moreOptions = [],
  moreLabel = "More",
}: {
  label: string;
  name: string;
  options: string[];
  selected: string[];
  allowUnspecified?: boolean;
  clearHref?: string;
  /** Rarely used values, tucked behind a toggle. */
  moreOptions?: string[];
  moreLabel?: string;
}) {
  const chosen = new Set(selected);
  // Anything already chosen is promoted, so a selection can never be hidden.
  const promoted = moreOptions.filter((o) => chosen.has(o));
  const rest = moreOptions.filter((o) => !chosen.has(o));
  // "unspecified" goes LAST: it is a fallback, not a first choice.
  const all = [...options, ...promoted, ...(allowUnspecified ? [UNSPECIFIED] : [])];
  return (
    <fieldset className="grid gap-1">
      {label ? (
        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
          {label}
          {chosen.size > 0 ? (
            <span className="ml-1 normal-case tracking-normal text-on-surface-muted">
              · {chosen.size} selected
            </span>
          ) : null}
          {clearHref ? (
            <Link
              href={clearHref}
              scroll={false}
              className="ml-2 normal-case tracking-normal text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
            >
              clear
            </Link>
          ) : null}
        </legend>
      ) : null}
      <div className="flex max-h-44 flex-wrap items-start content-start gap-1 overflow-y-auto pr-1">
        {all.map((o) => (
          <label key={o} className="cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={o}
              defaultChecked={chosen.has(o)}
              className="peer sr-only"
            />
            {/*
              Styled from the LIVE checkbox via peer-checked, not from server
              state. Driving it from the server meant clicking a chip changed
              nothing on screen until Apply was pressed, so it read as broken.
            */}
            <span
              className={
                "inline-block rounded-full border px-2 py-1 text-xs transition-colors " +
                (o === UNSPECIFIED
                  ? "border-dashed border-rule-surface italic text-on-surface-muted "
                  : "border-rule-surface ") +
                "hover:bg-panel-hover " +
                "peer-checked:border-brass peer-checked:bg-brass/20 peer-checked:font-semibold " +
                "peer-checked:not-italic peer-checked:text-on-surface " +
                "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brass"
              }
            >
              {o === UNSPECIFIED ? "not recorded" : o}
            </span>
          </label>
        ))}
      </div>

      {rest.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] text-on-surface-muted hover:text-on-surface">
            {moreLabel} ({rest.length})
          </summary>
          <div className="mt-1 flex flex-wrap items-start content-start gap-1">
            {rest.map((o) => (
              <label key={o} className="cursor-pointer">
                <input type="checkbox" name={name} value={o} className="peer sr-only" />
                <span className="inline-block rounded-full border border-dashed border-rule-surface px-2 py-1 text-xs text-on-surface-muted hover:bg-panel-hover peer-checked:border-solid peer-checked:border-brass peer-checked:bg-brass/20 peer-checked:font-semibold peer-checked:text-on-surface">
                  {o}
                </span>
              </label>
            ))}
          </div>
        </details>
      ) : null}
    </fieldset>
  );
}

/**
 * Singers with evidence they can sing this bhajan, as one-tap chips.
 *
 * Evidence, not permission — anybody may still be assigned in rostering
 * (SPEC §9.3). Picking here just saves a round trip for the obvious case.
 */
function SingerPicks({
  candidates,
  allSingers,
  picked,
  hrefFor,
}: {
  allSingers: Array<{ id: string; name: string; gender: string | null }>;
  candidates: Array<{
    id: string;
    name: string;
    gender: string | null;
    basis: string;
    lastSung: Date | null;
  }>;
  picked: string | null;
  hrefFor: (singerId: string | null) => string;
}) {
  const evidenced = new Set(candidates.map((c) => c.id));
  const others = allSingers.filter((s) => !evidenced.has(s.id));

  return (
    <div className="mt-2 border-t border-rule-surface pt-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
        {candidates.length > 0 ? "Can sing this" : "Nobody has sung this"}
      </div>
      {candidates.length === 0 ? (
        <p className="mb-1 text-xs text-on-surface-muted">
          Rostering will still suggest someone — or pick anyone below.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {candidates.map((c) => (
          <Link key={c.id} href={hrefFor(picked === c.id ? null : c.id)}>
            <span
              className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors " +
                (picked === c.id
                  ? "border-brass bg-brass/20 font-semibold text-on-surface"
                  : "border-rule-surface hover:bg-panel-hover")
              }
              title={
                c.lastSung
                  ? `Last sang this on ${c.lastSung.toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}`
                  : c.basis === "sung"
                  ? "Has sung this before"
                  : c.basis === "festival"
                    ? "On their festival list"
                    : "On their known list"
              }
            >
              {picked === c.id ? "✓ " : ""}
              {c.name}
              <span className="text-[10px] text-on-surface-muted">
                {/*
                  Full year, not "25". A two-digit year read as a day of the
                  month — "June 25" looked like the 25th of June, and on one
                  row it even coincided with the real day. Exact date is in the
                  tooltip.
                */}
                {c.lastSung
                  ? c.lastSung.toLocaleDateString("en-AU", {
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })
                  : c.basis === "festival"
                    ? "festival"
                    : "knows"}
              </span>
            </span>
          </Link>
        ))}
      </div>

      {/*
        Anyone may be assigned, not just those with evidence (SPEC §9.3) — but
        that is the uncommon case, so it sits behind a disclosure rather than
        doubling the chips on every row.
      */}
      {others.length > 0 ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs text-on-surface-muted hover:text-on-surface">
            Assign someone else
          </summary>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {others.map((o) => (
              <Link key={o.id} href={hrefFor(picked === o.id ? null : o.id)}>
                <span
                  className={
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors " +
                    (picked === o.id
                      ? "border-brass bg-brass/20 font-semibold text-on-surface"
                      : "border-dashed border-rule-surface text-on-surface-muted hover:bg-panel-hover")
                  }
                >
                  {picked === o.id ? "✓ " : ""}
                  {o.name}
                </span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}


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
import { DeitySymbol } from "@/components/DeitySymbol";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

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
  return qs ? `/build?${qs}` : "/build";
}

export default async function BuildPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const date = one(sp, "date") ?? melbourneToday();
  const seed = one(sp, "seed") ?? `${date}#1`;
  const freshnessDays = Number(one(sp, "fresh") ?? DEFAULT_FRESHNESS_DAYS) || DEFAULT_FRESHNESS_DAYS;
  const locked = list(sp, "lock");

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
      languages: list(sp, "lang"),
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

  // Re-roll bumps the numeric suffix, so a set stays reproducible from its URL.
  const seedBase = seed.includes("#") ? seed.slice(0, seed.lastIndexOf("#")) : seed;
  const seedCounter = Number(seed.slice(seed.lastIndexOf("#") + 1)) || 1;
  const nextSeed = `${seedBase}#${seedCounter + 1}`;

  const chosenIds = result.slots.map((s) => s.candidate.id);
  const [singersByBhajan, allSingers] = await Promise.all([
    getSingersForBhajans(chosenIds),
    prisma.singer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, gender: true } }),
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
            <input type="hidden" name="lock" value={locked.join(",")} />
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
            <p className="-mt-1 text-xs text-on-surface-muted">
              Only about 600 of the 3,607 bhajans have ever been sung here, so
              &ldquo;anything&rdquo; will often suggest songs nobody knows yet. That is
              deliberate — it is how the group learns new material — but pick{" "}
              <strong>only bhajans the group has sung</strong> when you need a set that will
              work this week.
            </p>

            <details className="rounded-[12px] border border-rule-surface bg-panel">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
                Filters
              </summary>
              <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                <MultiField
                  label="Deity (include)"
                  name="deity"
                  options={facets.deities}
                  selected={list(sp, "deity")}
                />
                <MultiField
                  label="Deity (exclude)"
                  name="notdeity"
                  options={facets.deities}
                  selected={list(sp, "notdeity")}
                  allowUnspecified={false}
                />
                <MultiField
                  label="Language"
                  name="lang"
                  options={facets.languages}
                  selected={list(sp, "lang")}
                />
                <MultiField
                  label="Tempo"
                  name="tempo"
                  options={facets.tempos}
                  selected={list(sp, "tempo")}
                />
                <MultiField
                  label="Level"
                  name="level"
                  options={facets.levels}
                  selected={list(sp, "level")}
                />
                <fieldset className="grid gap-1">
                  <legend className="text-xs font-semibold text-on-surface-muted">Must have</legend>
                  <Check name="lyrics" label="Lyrics" checked={one(sp, "lyrics") === "1"} />
                  <Check name="audio" label="Audio" checked={one(sp, "audio") === "1"} />
                  <Check name="ref" label="Reference pitch" checked={one(sp, "ref") === "1"} />
                </fieldset>
                <p className="text-xs text-on-surface-muted sm:col-span-2 lg:col-span-3">
                  Every facet offers <strong>unspecified</strong>, because a third of the
                  masterlist has no tempo and nearly a third no level. Leaving a facet unset never
                  drops a bhajan for lacking that field.
                </p>
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary">
                Apply
              </Button>
              <Link href={href(sp, { seed: nextSeed })}>
                <Button type="button">Re-roll unlocked</Button>
              </Link>
              {locked.length > 0 ? (
                <Link href={href(sp, { lock: undefined })}>
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
              const otherLocks = chosenIds.filter((id) => id !== slot.candidate.id);
              return (
                <li
                  key={slot.candidate.id}
                  // SPEC §6: one orchestrated moment. Unlocked slots settle into
                  // place in sequence after a re-roll; locked ones stay put and
                  // carry no animation. `prefers-reduced-motion` disables it.
                  className={`rounded-[12px] border border-rule-surface bg-panel p-3${slot.locked ? "" : " settle"}`}
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
                        <DeitySymbol
                          deity={slot.candidate.deities[0]}
                          size={17}
                          className="shrink-0 text-brass-ink"
                        />
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
                        href={href(sp, {
                          lock: slot.locked
                            ? locked.filter((id) => id !== slot.candidate.id).join(",")
                            : [...locked, slot.candidate.id].join(","),
                        })}
                      >
                        <Button type="button" className="w-full text-xs">
                          {slot.locked ? "Unlock" : "Lock"}
                        </Button>
                      </Link>
                      <Link href={href(sp, { lock: otherLocks.join(","), seed: nextSeed })}>
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
              <span className="text-xs text-on-surface-muted">
                Saves the bhajans, not the seed — the generator&rsquo;s weights change as history
                grows, so the same seed will not reproduce this set later. Singers are assigned in
                the roster.
              </span>
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
}: {
  label: string;
  name: string;
  options: string[];
  selected: string[];
  allowUnspecified?: boolean;
}) {
  const chosen = new Set(selected);
  const all = allowUnspecified ? [UNSPECIFIED, ...options] : options;
  return (
    <fieldset className="grid gap-1">
      <legend className="text-xs font-semibold text-on-surface-muted">
        {label}
        {chosen.size > 0 ? (
          <span className="ml-1 font-normal text-brass-ink">({chosen.size})</span>
        ) : null}
      </legend>
      <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
        {all.map((o) => (
          <label
            key={o}
            className={
              "cursor-pointer rounded-full border px-2 py-1 text-xs transition-colors " +
              (chosen.has(o)
                ? "border-brass/60 bg-brass/15 text-on-surface"
                : "border-rule-surface hover:bg-panel-hover")
            }
          >
            <input
              type="checkbox"
              name={name}
              value={o}
              defaultChecked={chosen.has(o)}
              className="sr-only"
            />
            {o === UNSPECIFIED ? "unspecified" : o}
          </label>
        ))}
      </div>
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
                c.basis === "sung"
                  ? "Has sung this before"
                  : c.basis === "festival"
                    ? "On their festival list"
                    : "On their known list"
              }
            >
              {picked === c.id ? "✓ " : ""}
              {c.name}
              <span className="text-[10px] text-on-surface-muted">
                {c.lastSung
                  ? c.lastSung.toLocaleDateString("en-AU", {
                      month: "short",
                      year: "2-digit",
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
                  <span className="text-[10px] text-on-surface-muted">{o.gender ?? ""}</span>
                </span>
              </Link>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

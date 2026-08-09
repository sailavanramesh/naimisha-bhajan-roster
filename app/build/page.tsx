import Link from "next/link";
import { prisma } from "@/lib/db";
import { SessionType } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import { getCandidatePool, getFacetOptions, UNSPECIFIED } from "@/lib/candidateQueries";
import {
  generateSession,
  DEFAULT_LENGTH,
  DEFAULT_FRESHNESS_DAYS,
  type TemplateSpec,
} from "@/lib/sessionBuilder";
import { saveDraftSession } from "./actions";

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
                  className="h-10 w-full rounded-key border px-3 text-sm"
                />
              </Field>

              <Field label="Template">
                <select
                  name="t"
                  defaultValue={template.name}
                  className="h-10 w-full rounded-key border px-3 text-sm"
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
                  className="h-10 w-full rounded-key border px-3 text-sm"
                />
              </Field>

              <Field label={`Flag if sung within (days)`}>
                <input
                  type="number"
                  name="fresh"
                  min={0}
                  max={999}
                  defaultValue={freshnessDays}
                  className="h-10 w-full rounded-key border px-3 text-sm"
                />
              </Field>

              <Field label="Repertoire">
                <select
                  name="sung"
                  defaultValue={one(sp, "sung") ?? "any"}
                  className="h-10 w-full rounded-key border px-3 text-sm"
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

            <details className="rounded-key border border-rule-surface bg-white">
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
              <Button type="submit" className="bg-black text-white hover:bg-black/90">
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
            <div className="rounded-key border border-warn/60 bg-warn/10 p-3">
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
                  className={`rounded-key border border-rule-surface bg-white/60 p-3${slot.locked ? "" : " settle"}`}
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
                        className="mt-1 block font-medium underline-offset-2 hover:underline"
                      >
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
                  result.slots.map((s) => ({ id: s.candidate.id, title: s.candidate.title })),
                )}
              />
              <Button type="submit" className="bg-black text-white hover:bg-black/90">
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
  return (
    <label className="grid gap-1">
      <span className="text-xs font-semibold text-on-surface-muted">{label}</span>
      <select
        name={name}
        multiple
        defaultValue={selected}
        size={Math.min(6, options.length + 1)}
        className="w-full rounded-key border px-2 py-1 text-sm"
      >
        {allowUnspecified ? <option value={UNSPECIFIED}>(unspecified)</option> : null}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

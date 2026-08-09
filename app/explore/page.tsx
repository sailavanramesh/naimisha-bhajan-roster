import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { getCandidatePool, getFacetOptions, UNSPECIFIED } from "@/lib/candidateQueries";
import { sampleBhajans, DEFAULT_FRESHNESS_DAYS } from "@/lib/sessionBuilder";
import { getRole, can } from "@/lib/auth";
import { NoAccess } from "@/components/RequireRole";
import { AddToList } from "./AddToList";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const one = (sp: SP, k: string) => {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};
const list = (sp: SP, k: string): string[] => {
  const v = sp[k];
  const raw = Array.isArray(v) ? v : v === undefined ? [] : [v];
  return raw.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
};

const PRIMARY_LANGUAGES = ["Sanskrit / Hindi", "English", "Tamil", "Telugu"];
const DEFAULT_LANGUAGES = ["Sanskrit / Hindi", "Tamil", "Telugu"];

/**
 * Explore — a randomised slice of the masterlist, for finding something to
 * learn.
 *
 * Deliberately NOT the session builder. There is no date, no template, no slot
 * rules and nothing to save as a session: a member browsing for material wants
 * a varied handful of bhajans, not a set that works as a session. It shares
 * the builder's weighting, so "interesting" means the same thing in both
 * places — fresher and less-sung float up.
 */
export default async function ExplorePage({ searchParams }: { searchParams: Promise<SP> }) {
  const role = await getRole();
  if (!can(role, "exploreBhajans")) {
    return <NoAccess what="Exploring the masterlist" role={role} />;
  }

  const sp = await searchParams;
  const count = Math.min(50, Math.max(1, Number(one(sp, "n") ?? 12) || 12));
  const seed = one(sp, "seed") ?? "explore#1";
  const freshnessDays = Number(one(sp, "fresh") ?? DEFAULT_FRESHNESS_DAYS) || DEFAULT_FRESHNESS_DAYS;
  const sungBefore = (one(sp, "sung") as "any" | "known" | "new") ?? "any";

  const [facets, singers] = await Promise.all([
    getFacetOptions(),
    prisma.singer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const pool = await getCandidatePool(
    {
      deities: list(sp, "deity"),
      languages: sp.lang === undefined ? DEFAULT_LANGUAGES : list(sp, "lang"),
      tempos: list(sp, "tempo"),
      levels: list(sp, "level"),
      sungBefore,
    },
    new Date(),
  );

  const picked = sampleBhajans(pool, { seed, count, freshnessDays });

  const href = (changes: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const value = Array.isArray(v) ? v.filter(Boolean).join(",") : v;
      if (value) p.set(k, value);
    }
    for (const [k, v] of Object.entries(changes)) {
      if (!v) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    return qs ? `/explore?${qs}` : "/explore";
  };

  const base = seed.includes("#") ? seed.slice(0, seed.lastIndexOf("#")) : seed;
  const nextSeed = `${base}#${Math.random().toString(36).slice(2, 8)}`;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Explore bhajans</CardTitle>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-muted">
            A different handful each time, drawn from {pool.length.toLocaleString()} bhajans.
            Nothing here is tied to a session — it is for finding something to learn. Add
            anything that catches you to{" "}
            <Link href="/my-list" className="text-brass-ink underline underline-offset-2">
              your list
            </Link>
            .
          </p>
        </CardHeader>

        <CardContent className="grid gap-4">
          <form method="get" action="/explore" className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="How many">
                <input
                  type="number"
                  name="n"
                  min={1}
                  max={50}
                  defaultValue={count}
                  className="h-11 w-full rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                />
              </Field>
              <Field label="Flag if sung within (days)">
                <input
                  type="number"
                  name="fresh"
                  min={0}
                  max={999}
                  defaultValue={freshnessDays}
                  className="h-11 w-full rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                />
              </Field>
              <Field label="Repertoire">
                <select
                  name="sung"
                  defaultValue={sungBefore}
                  className="h-11 w-full rounded-[10px] border border-rule-surface bg-field px-3 text-sm"
                >
                  <option value="any">Anything in the masterlist</option>
                  <option value="known">Only what the group has sung</option>
                  <option value="new">Only what nobody has sung</option>
                </select>
              </Field>
            </div>

            <details className="rounded-[12px] border border-rule-surface bg-panel">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
                Filters
              </summary>
              <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
                <Chips label="Deity" name="deity" options={facets.deities} selected={list(sp, "deity")} />
                <Chips
                  label="Language"
                  name="lang"
                  options={PRIMARY_LANGUAGES.filter((l) => facets.languages.some((f) => f.name === l))}
                  selected={sp.lang === undefined ? DEFAULT_LANGUAGES : list(sp, "lang")}
                />
                <Chips label="Tempo" name="tempo" options={facets.tempos} selected={list(sp, "tempo")} />
                <Chips label="Level" name="level" options={facets.levels} selected={list(sp, "level")} />
              </div>
            </details>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="primary">Apply</Button>
              <Link href={href({ seed: nextSeed })} scroll={false}>
                <Button type="button">Show me another set</Button>
              </Link>
              <Link href="/explore">
                <Button type="button">Reset</Button>
              </Link>
            </div>
          </form>

          {picked.length === 0 ? (
            <p className="text-sm text-on-surface-muted">
              Nothing matches those filters. Try clearing a few.
            </p>
          ) : (
            <ul className="grid gap-2">
              {picked.map((c) => (
                <li
                  key={c.id}
                  className="rounded-[12px] border border-rule-surface bg-panel p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/bhajans/${c.id}`}
                        className="flex items-center gap-2 font-medium underline-offset-2 hover:underline"
                      >
                        <DeitySymbols deities={c.deities} size={18} />
                        {c.title}
                      </Link>
                      <div className="mt-1 text-xs text-on-surface-muted">
                        {[
                          c.deities.join(", ") || "deity not recorded",
                          c.raga ?? "raga not recorded",
                          c.tempo ?? "tempo not recorded",
                          c.language ?? "language not recorded",
                        ].join(" · ")}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {c.timesSung === 0 ? (
                          <Badge>never sung here</Badge>
                        ) : (
                          <Badge>sung {c.timesSung}×</Badge>
                        )}
                        {c.lastSungDaysAgo !== null && c.lastSungDaysAgo < freshnessDays ? (
                          <Badge tone="warn">sung recently</Badge>
                        ) : null}
                        {c.hasLyrics ? <Badge>lyrics</Badge> : null}
                        {c.hasAudio ? <Badge>audio</Badge> : null}
                      </div>
                    </div>

                    <AddToList bhajanTitle={c.title} singers={singers} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
        {label}
      </span>
      {children}
    </label>
  );
}

function Chips({
  label,
  name,
  options,
  selected,
}: {
  label: string;
  name: string;
  options: string[];
  selected: string[];
}) {
  const chosen = new Set(selected);
  // "not recorded" last: it is a fallback, not a first choice.
  const all = [...options, UNSPECIFIED];
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-brass-ink">
        {label}
      </legend>
      <div className="flex max-h-40 flex-wrap items-start content-start gap-1 overflow-y-auto pr-1">
        {all.map((o) => (
          <label key={o} className="cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={o}
              defaultChecked={chosen.has(o)}
              className="peer sr-only"
            />
            <span
              className={
                "inline-block rounded-full border px-2 py-1 text-xs transition-colors " +
                (o === UNSPECIFIED
                  ? "border-dashed border-rule-surface italic text-on-surface-muted "
                  : "border-rule-surface ") +
                "hover:bg-panel-hover peer-checked:border-brass peer-checked:bg-brass/20 " +
                "peer-checked:font-semibold peer-checked:not-italic peer-checked:text-on-surface"
              }
            >
              {o === UNSPECIFIED ? "not recorded" : o}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

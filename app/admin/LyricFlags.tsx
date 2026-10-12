import { prisma } from "@/lib/db";
import { Button } from "@/components/ui";
import { melbourneTodayISO } from "@/lib/dates";
import { flagAppliesOn } from "@/lib/lyricFlags";
import { AddLyricFlagForm } from "./AddLyricFlagForm";
import { removeLyricFlag, setLyricFlagEnd } from "./actions";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shown = (s: string) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Words or phrases flagged in the lyrics of rostered bhajans.
 *
 * Every term is listed, past and future as well as current, so that ending
 * one is reversible: change or clear its end date rather than deleting it.
 */
export async function LyricFlags({ canEdit }: { canEdit: boolean }) {
  const flags = await prisma.lyricFlag.findMany({ orderBy: [{ startsOn: "desc" }, { term: "asc" }] });
  const today = melbourneTodayISO();

  return (
    <div className="grid gap-3">
      {flags.length === 0 ? (
        <p className="text-sm text-on-surface-muted">None yet.</p>
      ) : (
        <ul className="grid gap-2">
          {flags.map((f) => {
            const startsOn = iso(f.startsOn);
            const endsOn = f.endsOn ? iso(f.endsOn) : null;
            const status = flagAppliesOn({ startsOn, endsOn }, today)
              ? "active"
              : startsOn > today
                ? "upcoming"
                : "ended";
            return (
              <li
                key={f.id}
                className="grid gap-2 rounded-[12px] border border-rule-surface p-3 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <strong className="font-semibold">&ldquo;{f.term}&rdquo;</strong>
                    <span className="text-xs text-on-surface-muted">
                      {f.wholeWord ? "whole word" : "anywhere, even inside a word"}
                    </span>
                    <span
                      className={
                        status === "active" ? "text-xs font-semibold text-brass-ink" : "text-xs text-on-surface-muted"
                      }
                    >
                      {status}
                    </span>
                  </div>
                  <div className="text-xs text-on-surface-muted">
                    From {shown(startsOn)} {endsOn ? `until ${shown(endsOn)}` : "with no end"}
                    {f.createdByName ? ` · added by ${f.createdByName}` : ""}
                  </div>
                  {f.note ? <div className="mt-0.5 text-sm">{f.note}</div> : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setLyricFlagEnd} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={f.id} />
                      <input
                        type="date"
                        name="endsOn"
                        defaultValue={endsOn ?? ""}
                        min={startsOn}
                        aria-label={`End date for ${f.term}`}
                        className="h-9 min-w-0 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
                      />
                      <Button type="submit" className="h-9">
                        Set end
                      </Button>
                    </form>
                    <form action={removeLyricFlag}>
                      <input type="hidden" name="id" value={f.id} />
                      <Button type="submit" className="h-9" aria-label={`Remove ${f.term}`}>
                        Remove
                      </Button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? <AddLyricFlagForm today={today} /> : null}
    </div>
  );
}

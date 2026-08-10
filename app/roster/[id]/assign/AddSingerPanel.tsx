import Link from "next/link";
import { Button } from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { addSingerSlot } from "./actions";
import { SOURCE_LABEL, type SuggestedPitch } from "@/lib/suggestedPitch";

export type Suggestion = {
  bhajanId: string;
  title: string;
  deities: string[];
  raga: string | null;
  /** Why it is being suggested — "same raga", "on their list", … */
  reasons: string[];
  pitch: SuggestedPitch;
};

export type SuggestionGroup = {
  key: string;
  heading: string;
  blurb: string;
  items: Suggestion[];
};

/**
 * Singer-first rostering.
 *
 * The rest of this page works the other way round — slots already have bhajans
 * and singers are fitted to them fairly. That is the right tool when a session
 * has been built. This is for the other half of the job: somebody is available,
 * what should they sing.
 */
export function AddSingerPanel({
  sessionId,
  singers,
  selected,
  groups,
  basePath,
}: {
  sessionId: string;
  singers: Array<{ id: string; name: string; gender: string | null }>;
  selected: { id: string; name: string } | null;
  groups: SuggestionGroup[];
  basePath: string;
}) {
  if (!selected) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-on-surface-muted">
          Pick a singer to see what they could sing — what is on their own list, and
          bhajans musically close to it.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {singers.map((s) => (
            <li key={s.id}>
              <Link
                href={`${basePath}?add=${s.id}`}
                className="inline-flex h-8 items-center rounded-full border border-rule-surface bg-field px-3 text-sm hover:border-brass/50"
              >
                {s.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Adding <strong>{selected.name}</strong>
        </p>
        <div className="flex items-center gap-2">
          {/* "Just put them on" — a real way to roster, so it is a first-class
              button rather than something you reach by leaving a field blank. */}
          <form action={addSingerSlot}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="singerId" value={selected.id} />
            <input type="hidden" name="bhajanId" value="" />
            <input type="hidden" name="confirmedPitch" value="" />
            <Button type="submit" variant="primary">
              Add {selected.name}, no bhajan yet
            </Button>
          </form>
          <Link
            href={basePath}
            className="text-sm text-on-surface-muted underline underline-offset-2"
          >
            Pick someone else
          </Link>
        </div>
      </div>

      {groups.every((g) => g.items.length === 0) ? (
        <p className="rounded-[10px] border border-rule-surface bg-panel px-3 py-2 text-sm text-on-surface-muted">
          Nothing to suggest for {selected.name} yet — they have no list and no history to
          work from. Add them without a bhajan and fill it in on the roster.
        </p>
      ) : null}

      {groups.map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.key} className="grid gap-2">
            <div>
              <h3 className="text-sm font-semibold">{group.heading}</h3>
              <p className="text-xs text-on-surface-muted">{group.blurb}</p>
            </div>
            <ul className="grid gap-1.5">
              {group.items.map((item) => (
                <li
                  key={`${group.key}-${item.bhajanId}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[10px] border border-rule-surface bg-panel px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <DeitySymbols deities={item.deities} size={16} />
                      <Link
                        href={`/bhajans/${item.bhajanId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-on-surface-muted">
                      {item.raga ? <span className="italic">{item.raga}</span> : null}
                      {item.reasons.length > 0 ? <span>· {item.reasons.join(", ")}</span> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <PitchChip pitch={item.pitch} />
                    <form action={addSingerSlot}>
                      <input type="hidden" name="sessionId" value={sessionId} />
                      <input type="hidden" name="singerId" value={selected.id} />
                      <input type="hidden" name="bhajanId" value={item.bhajanId} />
                      {/*
                        Only a pitch they have actually committed to is carried
                        into confirmedPitch. A prediction is shown but not
                        written — see addSingerSlot.
                      */}
                      <input
                        type="hidden"
                        name="confirmedPitch"
                        value={
                          item.pitch.source === "list" || item.pitch.source === "sung"
                            ? (item.pitch.pitch ?? "")
                            : ""
                        }
                      />
                      <Button type="submit" className="h-8 text-xs">
                        Add
                      </Button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}

function PitchChip({ pitch }: { pitch: SuggestedPitch }) {
  if (!pitch.pitch) return null;

  const committed = pitch.source === "list" || pitch.source === "sung";
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-[8px] border px-2 py-1 font-mono text-xs",
        committed ? "border-brass/45 bg-field font-semibold" : "border-rule-surface bg-field/60",
      ].join(" ")}
      title={
        pitch.conflicted
          ? `Their list and their history disagree (${pitch.considered.join(", ")}) — the lower is shown`
          : SOURCE_LABEL[pitch.source]
      }
    >
      {pitch.pitch}
      <span className="font-sans text-[10px] font-normal text-on-surface-muted">
        {SOURCE_LABEL[pitch.source]}
      </span>
      {pitch.conflicted ? (
        <span className="font-sans text-[10px] font-semibold text-warn" title="lower of two">
          ↓
        </span>
      ) : null}
    </span>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui";
import { DeitySymbols } from "@/components/DeitySymbol";
import { addSingerSlot, removeSingerSlot } from "./actions";
import { SongsLink } from "./SongsLink";
import { SOURCE_LABEL, type SuggestedPitch } from "@/lib/suggestedPitch";

export type Suggestion = {
  bhajanId: string;
  title: string;
  deities: string[];
  raga: string | null;
  /** Why it is being suggested — "knows it", "same raga", … */
  reasons: string[];
  pitch: SuggestedPitch;
};

export type SuggestionGroup = {
  key: string;
  heading: string;
  blurb: string;
  items: Suggestion[];
};

export type LineupEntry = {
  slotId: string;
  position: number;
  singerName: string;
  bhajanTitle: string | null;
  /** Real history. Such a slot cannot be removed from here — see the action. */
  hasConfirmedPitch: boolean;
};

/**
 * Singer-first rostering.
 *
 * The rest of this page works the other way round — slots already have bhajans
 * and singers are fitted to them fairly. That is the right tool once a session
 * has been built. This is for the other half of the job: somebody is
 * available, what should they sing.
 *
 * Structured around the fact that rostering is a RUN of decisions, not one.
 * The singer list is always on screen, so the next person is one click away;
 * expanding somebody's suggestions never hides it; and adding somebody returns
 * here rather than to the roster.
 *
 * Every singer therefore offers two things, because both are real intentions:
 *   "Add"         — put them on now, they will choose a bhajan later
 *   "Suggestions" — show me what they could sing before I decide
 */
export function AddSingerPanel({
  sessionId,
  singers,
  selected,
  groups,
  basePath,
  lineup,
  justAdded,
  justRemoved,
  blocked,
}: {
  sessionId: string;
  singers: Array<{ id: string; name: string; gender: string | null }>;
  selected: { id: string; name: string } | null;
  groups: SuggestionGroup[];
  basePath: string;
  lineup: LineupEntry[];
  justAdded: string | null;
  justRemoved: string | null;
  blocked: string | null;
}) {
  return (
    <div className="grid gap-4">
      {justAdded ? (
        <p
          role="status"
          className="rounded-[10px] border border-brass/40 bg-brass/[0.08] px-3 py-2 text-sm"
        >
          Added <strong>{justAdded}</strong>. Pick the next singer, or{" "}
          <Link href={`/roster/${sessionId}`} className="underline underline-offset-2">
            go to the roster
          </Link>
          .
        </p>
      ) : null}

      {justRemoved ? (
        <p role="status" className="rounded-[10px] border border-rule-surface bg-panel px-3 py-2 text-sm">
          Removed <strong>{justRemoved}</strong>.
        </p>
      ) : null}

      {blocked ? (
        <p role="status" className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
          <strong>{blocked}</strong> has a confirmed pitch recorded, so removing them here
          would destroy what they actually sang. Remove them from the{" "}
          <Link href={`/roster/${sessionId}`} className="underline underline-offset-2">
            roster
          </Link>{" "}
          instead, where the pitch is visible.
        </p>
      ) : null}

      {/* Who is already on, so repeated adds are visible without leaving. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-on-surface-muted">In this session:</span>
        {lineup.length === 0 ? (
          <span className="text-on-surface-muted">nobody yet</span>
        ) : (
          lineup.map((l) => (
            <span
              key={l.slotId}
              className="inline-flex items-center gap-1 rounded-full border border-rule-surface bg-panel py-0.5 pl-2 pr-1 text-xs"
              title={l.bhajanTitle ?? "no bhajan yet"}
            >
              {l.singerName}
              {l.bhajanTitle ? "" : " · no bhajan"}
              <form action={removeSingerSlot} className="contents">
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="slotId" value={l.slotId} />
                <button
                  type="submit"
                  aria-label={`Remove ${l.singerName} from this session`}
                  title={
                    l.hasConfirmedPitch
                      ? `${l.singerName} has a confirmed pitch — remove them on the roster instead`
                      : `Remove ${l.singerName}`
                  }
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[12px] leading-none text-on-surface-muted hover:bg-rule-surface hover:text-on-surface"
                >
                  <span aria-hidden>×</span>
                </button>
              </form>
            </span>
          ))
        )}
      </div>

      {/*
        Split by voice, because that is how a coordinator thinks about a set —
        the reference pitch differs by voice and sessions alternate loosely
        between them, so "who else is available" is nearly always asked within
        one group rather than across both.
      */}
      {groupsByVoice(singers).map((voice) => (
        <div key={voice.label} className="grid gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
            {voice.label}
          </h4>
          <SingerChips
            singers={voice.singers}
            sessionId={sessionId}
            basePath={basePath}
            openId={selected?.id ?? null}
          />
        </div>
      ))}

      {selected ? (
        <section className="grid gap-4 rounded-[12px] border border-brass/35 bg-panel/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">What {selected.name} could sing</h3>
            <Link
              href={basePath}
              className="text-xs text-on-surface-muted underline underline-offset-2"
            >
              Collapse
            </Link>
          </div>

          {groups.every((g) => g.items.length === 0) ? (
            <p className="text-sm text-on-surface-muted">
              Nothing to suggest for {selected.name} yet — no list and no history to work
              from. Add them with the + above and fill the bhajan in on the roster.
            </p>
          ) : null}

          {groups.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.key} className="grid gap-2">
                <div>
                  <h4 className="text-sm font-semibold">{group.heading}</h4>
                  <p className="text-xs text-on-surface-muted">{group.blurb}</p>
                </div>
                <ul className="grid gap-1.5">
                  {group.items.map((item) => (
                    <li
                      key={`${group.key}-${item.bhajanId}`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[10px] border border-rule-surface bg-surface px-3 py-2"
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
                          {item.reasons.length > 0 ? (
                            <span>· {item.reasons.join(", ")}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <PitchChip pitch={item.pitch} />
                        <form action={addSingerSlot}>
                          <input type="hidden" name="sessionId" value={sessionId} />
                          <input type="hidden" name="singerId" value={selected.id} />
                          <input type="hidden" name="bhajanId" value={item.bhajanId} />
                          {/*
                            Only a pitch they have actually committed to is
                            carried into confirmedPitch. A prediction is shown
                            but never written — see addSingerSlot.
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
              </div>
            ),
          )}
        </section>
      ) : (
        <p className="text-xs text-on-surface-muted">
          <strong>+</strong> adds them straight away with no bhajan;{" "}
          <strong>songs</strong> shows what they could sing first.
        </p>
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

/** Gents first, then Ladies, then anyone with no voice recorded. */
function groupsByVoice(
  singers: Array<{ id: string; name: string; gender: string | null }>,
): Array<{ label: string; singers: Array<{ id: string; name: string; gender: string | null }> }> {
  const order = ["Gents", "Ladies"];
  const out: Array<{ label: string; singers: typeof singers }> = [];
  for (const label of order) {
    const group = singers.filter((s) => s.gender === label);
    if (group.length > 0) out.push({ label, singers: group });
  }
  const rest = singers.filter((s) => !order.includes(s.gender ?? ""));
  // Never silently drop somebody whose voice was never recorded.
  if (rest.length > 0) out.push({ label: "Voice not recorded", singers: rest });
  return out;
}

function SingerChips({
  singers,
  sessionId,
  basePath,
  openId,
}: {
  singers: Array<{ id: string; name: string; gender: string | null }>;
  sessionId: string;
  basePath: string;
  openId: string | null;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {singers.map((s) => {
        const open = openId === s.id;
        return (
          <li
            key={s.id}
            className={[
              "inline-flex items-stretch overflow-hidden rounded-full border",
              open ? "border-brass/60 bg-brass/[0.08]" : "border-rule-surface bg-field",
            ].join(" ")}
          >
            {/* Quick add — no expanding, no bhajan. */}
            <form action={addSingerSlot} className="contents">
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="singerId" value={s.id} />
              <input type="hidden" name="bhajanId" value="" />
              <input type="hidden" name="confirmedPitch" value="" />
              <button
                type="submit"
                title={`Add ${s.name} now, without choosing a bhajan`}
                className="inline-flex h-8 items-center gap-1.5 pl-3 pr-2 text-sm hover:bg-panel-hover"
              >
                <span aria-hidden className="text-brass-ink">+</span>
                {s.name}
              </button>
            </form>

            <SongsLink
              href={open ? basePath : `${basePath}?add=${s.id}`}
              open={open}
              singerName={s.name}
            />
          </li>
        );
      })}
    </ul>
  );
}

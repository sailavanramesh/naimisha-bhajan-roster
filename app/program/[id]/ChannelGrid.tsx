"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, CardContent, Input } from "@/components/ui";
import { micColourDot, type MicColourValue } from "@/lib/micCushion";
import { occupantFor, shortName, stripNumber } from "@/lib/deskChannels";
import { DeskStrips, stripName } from "@/components/DeskStrips";
import { songNumbers } from "@/lib/program";
import {
  setChannelOpen,
  setSceneNumber,
  suggestChannels,
  applyDesk,
  setItemChannelWho,
  refreshFromDesk,
  carryOverMics,
} from "./deskActions";

export type ChannelRow = {
  id: string;
  number: string;
  label: string;
  kind: "vocal" | "instrument" | "track" | "spare";
  colour: MicColourValue | null;
  /** Which mic is on it — "Wired", "Pegasus", "WL1". Reference only. */
  mic: string | null;
  /** Is this programme running the strip as a stereo pair? */
  stereo: boolean;
  singerId: string | null;
  instrumentId: string | null;
  person: string | null;
  /** A second person sharing this mic. */
  withSingerId: string | null;
  withPerson: string | null;
  who: string | null;
};

export type GridItem = {
  id: string;
  position: number;
  kind: "song" | "narration";
  title: string;
  sceneNumber: string;
  /** Channel ids open on this item. */
  open: string[];
  /**
   * Strips carrying somebody other than their usual occupant, on this item.
   * A singer's mic on the mridangam for one song, or on one head of a
   * two-sided drum.
   */
  swaps: {
    channelId: string;
    singerId: string | null;
    instrumentId: string | null;
    person: string | null;
    withSingerId: string | null;
    withPerson: string | null;
    who: string;
  }[];
};

/**
 * Which channels are open on each item.
 *
 * The artefact a document could never hold, and the one the sound desk actually
 * works from. Items down, channels across, a tick where a channel is open —
 * and on a desk with scenes it doubles as the scene plan, one scene per row.
 *
 * Readings are rows like anything else, and are the case that most rewards
 * this: a read passage wants one mic open and everything else down, which is
 * the change most easily fumbled live.
 */
export function ChannelGrid({
  sessionId,
  deskName,
  desks,
  channels,
  items,
  singers,
  instruments,
  guests,
  canEdit,
  canSetUpDesk,
}: {
  sessionId: string;
  deskName: string | null;
  desks: { id: string; name: string; channels: number }[];
  channels: ChannelRow[];
  items: GridItem[];
  singers: { id: string; name: string }[];
  instruments: { id: string; name: string }[];
  /** Names typed onto this programme who are not roster singers. */
  guests: string[];
  canEdit: boolean;
  /**
   * May SET UP the desk on this programme: which desk it is on, taking its
   * strips again, and the channel list itself.
   *
   * Editors, plus whoever is down as sound engineer or mic coordinator under
   * "Who is running it". Wider than `canEdit` on purpose — the person running
   * the sound is usually not an editor, and they are the one who needs it.
   *
   * Hiding these is a courtesy, not the permission: the actions enforce the same
   * rule server-side. See deskActions.ts.
   */
  canSetUpDesk: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickedDesk, setPickedDesk] = useState(desks[0]?.id ?? "");
  /*
   * Which item the drawn desk is showing, and which strip on it is selected.
   *
   * The desk is per ITEM because that is the only level at which "who is on
   * channel 3" has one answer — the same mic carries a singer on one song and a
   * drum on the next. Defaults to the first item, which is where a programme is
   * built from.
   */
  const [deskItemId, setDeskItemId] = useState<string | null>(null);
  const [deskStripId, setDeskStripId] = useState<string | null>(null);
  const stripEditor = useRef<HTMLDivElement | null>(null);

  /*
   * Bring the strip's editor into view when a strip is tapped.
   *
   * On a phone the twenty strips wrap to five or six rows, so the panel that
   * answers the tap opens below the fold — and a tap that appears to do nothing
   * is a tap people stop making. Sailavan asked for it to "scroll down a bit",
   * which is exactly what `block: "nearest"` does: the least movement that puts
   * the panel on screen, and no movement at all when it already is.
   *
   * Keyed on the selected strip, so it fires on a tap and not on every
   * re-render — the panel re-renders on every write it makes.
   */
  useEffect(() => {
    if (!deskStripId) return;
    const el = stripEditor.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [deskStripId]);

  const numbers = songNumbers(items);

  /*
   * Resolved AFTER the early return below, so both are safe to assume present:
   * this branch only renders when the programme has channels, and a programme
   * with channels and no items shows an empty running order rather than getting
   * here with nothing to point at.
   */
  const deskItem = items.find((i) => i.id === deskItemId) ?? items[0];
  const deskOpen = new Set(deskItem?.open ?? []);
  const deskSwapRow = deskItem?.swaps.find((sw) => sw.channelId === deskStripId) ?? null;
  const deskSwaps = new Map((deskItem?.swaps ?? []).map((sw) => [sw.channelId, sw.who]));
  const deskStrip = channels.find((c) => c.id === deskStripId) ?? null;

  const say = (res: { ok: boolean; error?: string }, good: string) =>
    setMessage(res.ok ? { ok: true, text: good } : { ok: false, text: res.error ?? "Failed." });

  if (channels.length === 0) {
    return (
      <Card>
        <CardContent className="grid gap-3 py-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Mics and channels</h2>
            <p className="mt-1 text-sm text-on-surface-muted">
              Pick the desk this programme is mixed on, or build the channel list from the people
              already in it. Nothing here changes the desk itself — a programme keeps its own copy.
            </p>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              {desks.length > 0 ? (
                <>
                  <select
                    value={pickedDesk}
                    aria-label="Which desk"
                    className="h-9 rounded-key border border-rule-surface bg-field px-2 text-sm"
                    onChange={(e) => setPickedDesk(e.target.value)}
                  >
                    {desks.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.channels} channels)
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    className="h-9"
                    disabled={pending || !pickedDesk}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await applyDesk({ sessionId, deskId: pickedDesk });
                        say(res, "Channels copied from the desk.");
                      })
                    }
                  >
                    Use this desk
                  </Button>
                  <span className="text-xs text-on-surface-muted">or</span>
                </>
              ) : (
                <span className="text-xs text-on-surface-muted">
                  No desks set up yet —{" "}
                  <Link href="/admin" className="underline underline-offset-2">
                    add one in Admin
                  </Link>
                  , or
                </span>
              )}
              <Button
                type="button"
                variant="primary"
                className="h-9"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await suggestChannels({ sessionId });
                    say(
                      res,
                      res.ok
                        ? res.added === 0
                          ? "Nobody in the programme to build channels from yet."
                          : `Added ${res.added} channel${res.added === 1 ? "" : "s"}.`
                        : "",
                    );
                  })
                }
              >
                Build from the programme
              </Button>
            </div>
          ) : (
            <p className="text-sm text-on-surface-muted">No channels set up yet.</p>
          )}

          {message ? (
            <p role="status" className={message.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
              {message.text}
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid gap-3 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {/*
            No help text. Sailavan: "don't need any help text here" — by the
            time somebody is on this screen they know what a tick means, and the
            desk name is already on the picker to the right.
          */}
          <h2 className="font-display text-xl font-semibold">Mics and channels</h2>
          <div className="flex flex-wrap items-center gap-3">
            {/*
              The desk view first: it is what somebody opens ON THE NIGHT,
              whereas the sheet is what they printed the day before.
            */}
            <Link
              href={`/program/${sessionId}/desk`}
              className="text-sm font-semibold text-brass-ink underline underline-offset-2"
            >
              Desk view →
            </Link>
            <Link
              href={`/program/${sessionId}/print`}
              target="_blank"
              className="text-sm text-on-ground-muted underline underline-offset-2 hover:text-on-ground"
            >
              Printable sheet ↗
            </Link>
            {/*
              WHERE A CHANNEL IS ACTUALLY NAMED, now that this page no longer
              names one.

              The per-programme channel list used to live below the grid, and it
              was a second place to say what channel 6 carries — Sailavan:
              "remove this section as it is not needed because the sound desk
              does the same function". So there is one place, /admin/desks, and
              this is the way to it from here; "Update from the desk" beside it
              brings the change back onto this programme.

              Shown to whoever may set the desk up — editors, and whoever is
              down as sound engineer or mic coordinator. The desks page enforces
              its own `manageDesks` rule; somebody without the grant reads it.
            */}
            {canSetUpDesk ? (
              <Link
                href="/admin/desks"
                className="text-sm text-on-ground-muted underline underline-offset-2 hover:text-on-ground"
              >
                Set up the desk →
              </Link>
            ) : null}
            {/*
              A programme's strips are a SNAPSHOT, which is what lets an old
              programme still say what was on channel 6 after the desk has been
              re-patched. The cost is that tidying the desk does not reach a
              programme already set up — correct, and unhelpful while you are
              still preparing one. This asks for the desk as it is now.
            */}
            {canSetUpDesk && deskName ? (
              <span className="flex flex-wrap items-center gap-1.5">
                {/*
                  Which desk this programme is on, changeable after the fact.
                  Sailavan keeps versions of one desk — a festival patch and an
                  ordinary Thursday — and picks between them per programme.
                  Switching is the same operation as refreshing, so it is one
                  control: choose a desk, take its strips.
                */}
                <select
                  value={desks.find((d) => d.name === deskName)?.id ?? ""}
                  aria-label="Which desk this programme is on"
                  disabled={pending}
                  className="h-7 rounded-key border border-rule-surface bg-field px-1 text-xs"
                  onChange={(e) =>
                    startTransition(async () => {
                      const res = await refreshFromDesk({ sessionId, deskId: e.target.value });
                      say(
                        res,
                        res.ok
                          ? `Now on ${desks.find((d) => d.id === e.target.value)?.name}.${res.removed > 0 ? ` Dropped ${res.removed} strip${res.removed === 1 ? "" : "s"} it does not have.` : ""}`
                          : "",
                      );
                    })
                  }
                >
                  {desks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={pending}
                  className="text-sm text-on-ground-muted underline underline-offset-2 hover:text-on-ground"
                  onClick={() =>
                    startTransition(async () => {
                      const res = await refreshFromDesk({ sessionId });
                      say(
                        res,
                        res.ok
                          ? `Took ${res.updated} strip${res.updated === 1 ? "" : "s"} from ${deskName}${res.added > 0 ? `, added ${res.added}` : ""}${res.removed > 0 ? `, dropped ${res.removed}` : ""}${res.kept > 0 ? `. ${res.kept} the desk no longer has ${res.kept === 1 ? "is" : "are"} kept — somebody is on ${res.kept === 1 ? "it" : "them"}` : ""}.`
                          : "",
                      );
                    })
                  }
                >
                  Update from the desk
                </button>
              </span>
            ) : null}
          </div>
        </div>

        {/*
          Scrolls sideways on its own rather than pushing the page.
          Twenty channels cannot fit a phone, and the alternative — shrinking
          them until they do — is a grid nobody can tick accurately.
        */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-rule-surface bg-surface px-2 py-1.5 text-left font-semibold">
                  Item
                </th>
                <th className="w-14 border-b border-rule-surface px-1 py-1.5 text-center font-semibold">
                  Scene
                </th>
                {/*
                  The column says WHO, not just which number.

                  A grid of bare numbers made you hold the channel list in your
                  head to read it — the tick under "7" means nothing until you
                  remember that 7 is the tabla. Three letters underneath is
                  enough to read a column without looking anything up, and the
                  full name is in the tooltip for when it is not.
                */}
                {channels.map((c) => (
                  <th
                    key={c.id}
                    className="w-11 border-b border-rule-surface px-0.5 py-1.5 text-center align-bottom font-semibold"
                    title={`${stripNumber(c.number, c.stereo)} · ${c.label}${c.who ? ` (${c.who})` : ""}`}
                  >
                    {/*
                      A LABEL, not a way in. The heading used to open a
                      per-programme editor for the strip; naming a strip now
                      happens once, on the desk itself — see "Set up the desk"
                      above.
                    */}
                    <span className="flex flex-col items-center gap-0.5">
                      {c.colour ? (
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full"
                          style={{ background: micColourDot(c.colour) ?? undefined }}
                        />
                      ) : null}
                      <span className="font-mono text-xs">{stripNumber(c.number, c.stereo)}</span>
                      {/* Never "C2" under the number 2 — `stripName` drops a
                          bare "Channel N", which is the number already above. */}
                      <span className="block w-full truncate text-[9px] font-normal leading-none text-on-surface-muted">
                        {shortName(stripName(c.who, c.label) ?? "")}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {items.map((item) => [
                <tr key={item.id} className="odd:bg-field/40">
                  {/*
                    The TITLE truncates; the actions under it do not.

                    They used to sit on the same line inside a `truncate` cell,
                    which is `overflow: hidden` — so a long title pushed them
                    past the 220px edge where they were clipped, unreadable and
                    literally unclickable. Their own line costs a few pixels of
                    height and always works.
                  */}
                  <td className="sticky left-0 z-10 max-w-[220px] bg-surface px-2 py-1 odd:bg-field/40">
                    <div className="flex items-baseline gap-1.5">
                      <span className="shrink-0 font-mono text-[11px] text-on-surface-muted">
                        {item.kind === "narration" ? "read" : numbers.get(item.position)}
                      </span>
                      <span className="min-w-0 truncate">
                        {item.title || (item.kind === "narration" ? "Reading" : "Not chosen yet")}
                      </span>
                    </div>
                  </td>

                  <td className="px-1 py-1 text-center">
                    {canEdit ? (
                      <input
                        defaultValue={item.sceneNumber}
                        aria-label={`Scene number for ${item.title || "this item"}`}
                        inputMode="numeric"
                        className="h-7 w-11 rounded border border-rule-surface bg-field text-center font-mono text-xs"
                        onBlur={(e) =>
                          startTransition(async () => {
                            await setSceneNumber({ itemId: item.id, scene: e.target.value });
                          })
                        }
                      />
                    ) : (
                      <span className="font-mono text-xs">{item.sceneNumber || "—"}</span>
                    )}
                  </td>

                  {channels.map((c) => {
                    const open = item.open.includes(c.id);
                    return (
                      <td key={c.id} className="px-0.5 py-1 text-center">
                        <button
                          type="button"
                          disabled={!canEdit || pending}
                          role="switch"
                          aria-checked={open}
                          aria-label={`Channel ${stripNumber(c.number, c.stereo)} on ${item.title || "this item"}`}
                          className={`h-6 w-6 rounded border text-xs leading-none ${
                            open
                              ? "border-brass/60 bg-brass/20 text-brass-ink"
                              : "border-rule-surface bg-field text-transparent"
                          } ${canEdit ? "hover:border-brass/50" : ""}`}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await setChannelOpen({
                                itemId: item.id,
                                channelId: c.id,
                                open: !open,
                              });
                              if (!res.ok) say(res, "");
                            })
                          }
                        >
                          ✓
                        </button>
                      </td>
                    );
                  })}
                </tr>,
                null,
              ])}
            </tbody>
          </table>
        </div>

        {/*
        {/*
          THE DESK, DRAWN — per ITEM, which is the only level it means anything at.

          Sailavan: "the desk where you tap a strip should be at the item level,
          as the person on a mic for a song might vary from song to song." Just
          so. A programme-wide desk can only show the usual occupant, and the
          question a sound person actually has is never "whose mic is channel 3
          normally" — it is "for the thing about to start, which faders are up
          and who is on them".

          So the desk shows ONE item at a time, lit by what is open for that
          item, and tapping a strip opens both answers for that item together.
          It is the same drawn desk the live view uses on the night, so what you
          set up here is literally the picture you will be reading then.

          The items × channels grid above stays: it is the whole programme at
          once, which this deliberately is not, and it is what the printed sheet
          mirrors.
        */}
        <div className="grid gap-2 rounded-[10px] border border-rule-surface p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-muted">
              The desk for
            </span>
            {/*
              Tabs rather than a dropdown: the running order is short, and
              stepping along it one item at a time is the actual task — a
              dropdown would hide the neighbours you are comparing against.
            */}
            {items.map((it) => {
              const on = it.id === deskItem.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setDeskItemId(it.id);
                    setDeskStripId(null);
                  }}
                  className={[
                    "rounded-key border px-2 py-1 text-[11px]",
                    on
                      ? "border-brass-ink/70 bg-brass-ink text-ivory"
                      : "border-rule-surface text-on-surface-muted hover:border-brass/50",
                  ].join(" ")}
                >
                  <span className="font-mono">
                    {it.kind === "narration" ? "read" : numbers.get(it.position)}
                  </span>
                  <span className="ms-1.5">
                    {it.title || (it.kind === "narration" ? "Reading" : "Not chosen yet")}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="flex flex-wrap items-center gap-2 text-[11px] text-on-surface-muted">
            <span>
              {deskOpen.size} of {channels.length} open. Tap a strip to change it for this item.
            </span>
            {/*
              Most of a running order is the same people on the same mics — the
              set changes, the patch mostly does not. This fills the open strips
              that nobody has answered yet from the item before, and touches
              neither the open set nor an answer already given, so it can be
              pressed twice or after a correction without undoing anything.
            */}
            {canEdit && items[0]?.id !== deskItem.id ? (
              <button
                type="button"
                disabled={pending}
                className="underline underline-offset-2 hover:text-on-surface"
                onClick={() =>
                  startTransition(async () => {
                    const res = await carryOverMics({ itemId: deskItem.id });
                    say(
                      res,
                      res.ok
                        ? res.copied === 0
                          ? "Nothing to carry over — every open mic here already says who is on it."
                          : `Carried over ${res.copied} mic${res.copied === 1 ? "" : "s"}.`
                        : "",
                    );
                  })
                }
              >
                carry over from the item before
              </button>
            ) : null}
          </p>

          <DeskStrips
            strips={channels.map((c) => ({
              id: c.id,
              number: c.number,
              label: c.label,
              kind: c.kind,
              colour: c.colour,
              mic: c.mic,
              stereo: c.stereo,
              // What is true FOR THIS ITEM: the override where there is one,
              // the channel's usual occupant otherwise.
              who: occupantFor(c, { person: deskSwaps.get(c.id) ?? null }),
            }))}
            openIds={deskOpen}
            swappedIds={new Set(deskSwaps.keys())}
            onPick={canEdit ? (id) => setDeskStripId(id === deskStripId ? null : id) : undefined}
          />

          {/*
            One strip, both facts.

            A tap cannot set two things, and a strip carries two: is the fader up
            for this item, and who is on it. So the tap selects, and the answer
            to both appears here — rather than a tap that means "open" and some
            other gesture nobody will find that means "who".
          */}
          {deskStrip ? (
            <div
              ref={stripEditor}
              className="grid gap-1.5 rounded-[8px] border border-brass/50 bg-panel p-2"
            >
              <p className="text-[11px] font-semibold">
                Channel {stripNumber(deskStrip.number, deskStrip.stereo)}
                <span className="ms-1.5 font-normal text-on-surface-muted">
                  on {deskItem.title || (deskItem.kind === "narration" ? "Reading" : "this item")}
                </span>
              </p>

              <label className="flex items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  checked={deskOpen.has(deskStrip.id)}
                  disabled={!canEdit || pending}
                  className="h-3.5 w-3.5"
                  onChange={(e) =>
                    startTransition(async () => {
                      const res = await setChannelOpen({
                        itemId: deskItem.id,
                        channelId: deskStrip.id,
                        open: e.target.checked,
                      });
                      if (!res.ok) say(res, "");
                    })
                  }
                />
                open for this item
              </label>

              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-on-surface-muted">who</span>
                <WhoSelect
                  value={
                    deskSwapRow?.singerId
                      ? { kind: "singer", id: deskSwapRow.singerId }
                      : deskSwapRow?.instrumentId
                        ? { kind: "instrument", id: deskSwapRow.instrumentId }
                        : { kind: "none" }
                  }
                  singers={singers}
                  instruments={instruments}
                  guests={guests}
                  disabled={!canEdit || pending}
                  emptyLabel={deskStrip.who ?? "usual"}
                  label={`Who is on channel ${stripNumber(deskStrip.number, deskStrip.stereo)} for this item`}
                  onPick={(picked) =>
                    startTransition(async () => {
                      const res = await setItemChannelWho({
                        itemId: deskItem.id,
                        channelId: deskStrip.id,
                        singerId: picked.kind === "singer" ? picked.id : null,
                        instrumentId: picked.kind === "instrument" ? picked.id : null,
                        person: picked.kind === "person" ? picked.name : null,
                      });
                      say(res, "");
                    })
                  }
                />
                <Input
                  key={`${deskItem.id}-${deskStrip.id}`}
                  defaultValue={deskSwapRow?.person ?? ""}
                  disabled={!canEdit || pending}
                  aria-label="Or a name for this item"
                  placeholder="or a name"
                  className="h-7 w-28 text-[11px]"
                  onBlur={(e) =>
                    startTransition(async () => {
                      const res = await setItemChannelWho({
                        itemId: deskItem.id,
                        channelId: deskStrip.id,
                        person: e.target.value || null,
                        singerId: null,
                        instrumentId: null,
                      });
                      say(res, "");
                    })
                  }
                />
              </span>

              {/*
                A mic can be shared. Two singers on one channel is a real thing —
                a duet taken on one mic — and the desk needs both names or it
                brings the wrong one up.
              */}
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-on-surface-muted">shared with</span>
                <WhoSelect
                  value={
                    deskSwapRow?.withSingerId
                      ? { kind: "singer", id: deskSwapRow.withSingerId }
                      : deskSwapRow?.withPerson
                        ? { kind: "person", name: deskSwapRow.withPerson }
                        : { kind: "none" }
                  }
                  singers={singers}
                  instruments={[]}
                  guests={guests}
                  disabled={!canEdit || pending}
                  emptyLabel="nobody"
                  label={`Who shares channel ${stripNumber(deskStrip.number, deskStrip.stereo)} on this item`}
                  onPick={(picked) =>
                    startTransition(async () => {
                      const res = await setItemChannelWho({
                        itemId: deskItem.id,
                        channelId: deskStrip.id,
                        withSingerId: picked.kind === "singer" ? picked.id : null,
                        withPerson: picked.kind === "person" ? picked.name : null,
                      });
                      say(res, "");
                    })
                  }
                />
              </span>

              <p className="text-[11px] text-on-surface-muted">
                Leave &ldquo;who&rdquo; alone and the channel&rsquo;s own name stands. Change that
                name on the desk itself.
              </p>
            </div>
          ) : null}
        </div>

        {message ? (
          <p role="status" className={message.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Who or what is on a strip — singers and instruments in ONE list.
 *
 * Sailavan asked for a single dropdown with headers rather than two controls,
 * and the reason is the thing that makes this hard to model any other way: a
 * mic moves between a voice and an instrument. Channel 3 is Prasanna tonight
 * and the mridangam on the next song, and asking "is this a vocal or an
 * instrument?" before you can say whose it is gets the order backwards.
 *
 * `optgroup` is what browsers give for this, and it is the right thing here:
 * one control, one answer, two labelled groups inside it. On a phone it opens
 * as the native picker with the headings intact.
 *
 * The value carries its own type — "s:<id>" or "i:<id>" — so the caller never
 * has to guess which table an id came from.
 */
export type ChannelWho =
  | { kind: "none" }
  | { kind: "singer"; id: string }
  | { kind: "instrument"; id: string }
  /** A guest, who has a name in this programme and no row in the roster. */
  | { kind: "person"; name: string };

export function whoValue(who: ChannelWho): string {
  if (who.kind === "singer") return `s:${who.id}`;
  if (who.kind === "instrument") return `i:${who.id}`;
  if (who.kind === "person") return `p:${who.name}`;
  return "";
}

export function parseWho(value: string): ChannelWho {
  if (value.startsWith("s:")) return { kind: "singer", id: value.slice(2) };
  if (value.startsWith("i:")) return { kind: "instrument", id: value.slice(2) };
  if (value.startsWith("p:")) return { kind: "person", name: value.slice(2) };
  return { kind: "none" };
}

function WhoSelect({
  value,
  singers,
  instruments,
  guests,
  label,
  disabled,
  className,
  emptyLabel = "—",
  onPick,
}: {
  value: ChannelWho;
  singers: { id: string; name: string }[];
  instruments: { id: string; name: string }[];
  /** Names typed onto this programme who are not roster singers. */
  guests: string[];
  label: string;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
  onPick: (who: ChannelWho) => void;
}) {
  return (
    <select
      value={whoValue(value)}
      aria-label={label}
      disabled={disabled}
      className={className ?? "h-8 min-w-0 rounded-key border border-rule-surface bg-field px-1 text-xs"}
      onChange={(e) => onPick(parseWho(e.target.value))}
    >
      <option value="">{emptyLabel}</option>
      {singers.length > 0 ? (
        <optgroup label="Singers">
          {singers.map((s) => (
            <option key={s.id} value={`s:${s.id}`}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {instruments.length > 0 ? (
        <optgroup label="Instruments">
          {instruments.map((i) => (
            <option key={i.id} value={`i:${i.id}`}>
              {i.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {/*
        Guests — people singing on this programme who have no row in the roster.
        Sailavan: "if I have added a guest to sing a song, they should show up in
        the mic selection list." They need a mic like anybody else, and typing
        the name a second time into the free-text box is asking somebody to
        repeat what the programme already knows.
      */}
      {guests.length > 0 ? (
        <optgroup label="Guests">
          {guests.map((name) => (
            <option key={name} value={`p:${name}`}>
              {name}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}

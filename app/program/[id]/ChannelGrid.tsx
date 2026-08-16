"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Card, CardContent, Input } from "@/components/ui";
import { CHORUS_COLOURS, micColourDot, type MicColourValue } from "@/lib/micCushion";
import { songNumbers } from "@/lib/program";
import {
  addChannel,
  removeChannel,
  setChannelOpen,
  setSceneNumber,
  suggestChannels,
  suggestOpenChannels,
  updateChannel,
  applyDesk,
} from "./deskActions";

export type ChannelRow = {
  id: string;
  number: string;
  label: string;
  kind: "vocal" | "instrument" | "track" | "spare";
  colour: MicColourValue | null;
  singerId: string | null;
  person: string | null;
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
  canEdit,
}: {
  sessionId: string;
  deskName: string | null;
  desks: { id: string; name: string; channels: number }[];
  channels: ChannelRow[];
  items: GridItem[];
  singers: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickedDesk, setPickedDesk] = useState(desks[0]?.id ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState("");

  const numbers = songNumbers(items);
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
          <div>
            <h2 className="font-display text-xl font-semibold">Mics and channels</h2>
            <p className="mt-0.5 text-sm text-on-surface-muted">
              {deskName ? `${deskName} · ` : ""}
              {channels.length} channel{channels.length === 1 ? "" : "s"}. A tick is a channel that
              should be open.
            </p>
          </div>
          <Link
            href={`/program/${sessionId}/print`}
            target="_blank"
            className="text-sm text-on-ground-muted underline underline-offset-2 hover:text-on-ground"
          >
            Printable sheet ↗
          </Link>
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
                {channels.map((c) => (
                  <th
                    key={c.id}
                    className="w-9 border-b border-rule-surface px-0.5 py-1.5 text-center align-bottom font-semibold"
                    title={`${c.number} · ${c.label}${c.who ? ` (${c.who})` : ""}`}
                  >
                    <span className="flex flex-col items-center gap-0.5">
                      {c.colour ? (
                        <span
                          aria-hidden
                          className="h-2 w-2 rounded-full"
                          style={{ background: micColourDot(c.colour) ?? undefined }}
                        />
                      ) : null}
                      <span className="font-mono text-xs">{c.number}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="odd:bg-field/40">
                  <td className="sticky left-0 z-10 max-w-[220px] truncate bg-surface px-2 py-1 odd:bg-field/40">
                    <span className="mr-1.5 font-mono text-[11px] text-on-surface-muted">
                      {item.kind === "narration" ? "read" : numbers.get(item.position)}
                    </span>
                    {item.title || (item.kind === "narration" ? "Reading" : "Not chosen yet")}
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="ml-2 text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                        onClick={() =>
                          startTransition(async () => {
                            const res = await suggestOpenChannels({ itemId: item.id });
                            say(
                              res,
                              res.ok ? `${res.open} channel${res.open === 1 ? "" : "s"} open.` : "",
                            );
                          })
                        }
                      >
                        fill from who is on it
                      </button>
                    ) : null}
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
                          aria-label={`Channel ${c.number} on ${item.title || "this item"}`}
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* The channel list itself, below the grid where it is edited rarely. */}
        <details className="rounded-[10px] border border-rule-surface p-2">
          <summary className="cursor-pointer text-sm font-medium">
            The channels ({channels.length})
          </summary>
          <ul className="mt-2 grid gap-1">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-8 shrink-0 text-right font-mono text-xs text-on-surface-muted">
                  {c.number}
                </span>
                {editing === c.id && canEdit ? (
                  <ChannelEditor
                    channel={c}
                    singers={singers}
                    onDone={() => setEditing(null)}
                    onMessage={setMessage}
                  />
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate">
                      {c.label}
                      {c.who && c.who !== c.label ? (
                        <span className="ml-1 text-xs text-on-surface-muted">({c.who})</span>
                      ) : null}
                      <span className="ml-2 text-[11px] uppercase tracking-wide text-on-surface-muted">
                        {c.kind}
                      </span>
                    </span>
                    {canEdit ? (
                      <>
                        <button
                          type="button"
                          className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
                          onClick={() => setEditing(c.id)}
                        >
                          edit
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="text-[11px] text-on-surface-muted underline underline-offset-2 hover:text-warn"
                          onClick={() =>
                            startTransition(async () => {
                              const res = await removeChannel({ id: c.id });
                              if (!res.ok) say(res, "");
                            })
                          }
                        >
                          remove
                        </button>
                      </>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>

          {canEdit ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="number"
                aria-label="New channel number"
                className="h-8 w-20"
              />
              <Button
                type="button"
                className="h-8 text-xs"
                disabled={pending || newNumber.trim().length === 0}
                onClick={() =>
                  startTransition(async () => {
                    const res = await addChannel({ sessionId, number: newNumber, label: "" });
                    say(res, `Added channel ${newNumber.trim()}.`);
                    if (res.ok) setNewNumber("");
                  })
                }
              >
                Add a channel
              </Button>
              <Button
                type="button"
                className="h-8 text-xs"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await suggestChannels({ sessionId });
                    say(
                      res,
                      res.ok
                        ? res.added === 0
                          ? "Everybody in the programme already has a channel."
                          : `Added ${res.added} channel${res.added === 1 ? "" : "s"}.`
                        : "",
                    );
                  })
                }
              >
                Add anyone missing
              </Button>
            </div>
          ) : null}
        </details>

        {message ? (
          <p role="status" className={message.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChannelEditor({
  channel,
  singers,
  onDone,
  onMessage,
}: {
  channel: ChannelRow;
  singers: { id: string; name: string }[];
  onDone: () => void;
  onMessage: (m: { ok: boolean; text: string } | null) => void;
}) {
  const [label, setLabel] = useState(channel.label);
  const [kind, setKind] = useState(channel.kind);
  const [singerId, setSingerId] = useState(channel.singerId ?? "");
  const [person, setPerson] = useState(channel.person ?? "");
  const [colour, setColour] = useState<MicColourValue | null>(channel.colour);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <Input
        value={label}
        aria-label="Channel label"
        className="h-8 w-36"
        onChange={(e) => setLabel(e.target.value)}
      />
      <select
        value={kind}
        aria-label="What it carries"
        className="h-8 rounded-key border border-rule-surface bg-field px-1 text-xs"
        onChange={(e) => setKind(e.target.value as ChannelRow["kind"])}
      >
        <option value="vocal">vocal</option>
        <option value="instrument">instrument</option>
        <option value="track">track</option>
        <option value="spare">spare</option>
      </select>
      <select
        value={singerId}
        aria-label="Who is on it"
        className="h-8 rounded-key border border-rule-surface bg-field px-1 text-xs"
        onChange={(e) => {
          setSingerId(e.target.value);
          if (e.target.value) setPerson("");
        }}
      >
        <option value="">—</option>
        {singers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Input
        value={person}
        aria-label="Or a name"
        placeholder="or a name"
        className="h-8 w-28"
        onChange={(e) => {
          setPerson(e.target.value);
          if (e.target.value) setSingerId("");
        }}
      />
      <span className="flex items-center gap-1">
        {CHORUS_COLOURS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={`${c.label} cushion`}
            aria-pressed={colour === c.value}
            className={`h-4 w-4 rounded-full border ${
              colour === c.value ? "scale-110 border-on-surface" : "border-rule-surface opacity-70"
            }`}
            style={{ background: c.dot }}
            onClick={() => setColour(colour === c.value ? null : (c.value as MicColourValue))}
          />
        ))}
      </span>
      <Button
        type="button"
        variant="primary"
        className="h-8 text-xs"
        disabled={pending || label.trim().length === 0}
        onClick={() =>
          startTransition(async () => {
            const res = await updateChannel({
              id: channel.id,
              label,
              kind,
              singerId,
              person,
              colour,
            });
            if (res.ok) onDone();
            else onMessage({ ok: false, text: res.error });
          })
        }
      >
        Save
      </Button>
      <button
        type="button"
        className="text-[11px] text-on-surface-muted underline underline-offset-2"
        onClick={onDone}
      >
        cancel
      </button>
    </span>
  );
}

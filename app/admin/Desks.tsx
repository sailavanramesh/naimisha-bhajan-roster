"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { addDesk, removeDesk, updateDeskChannel } from "./deskActions";

export type DeskRow = {
  id: string;
  name: string;
  kind: "analog" | "digital";
  isDefault: boolean;
  usedBy: number;
  channels: { id: string; number: number; label: string; kind: string }[];
};

const KINDS = ["vocal", "instrument", "track", "spare"] as const;

/**
 * The desks the centre mixes on.
 *
 * A template only: a programme copies these strips when it picks a desk, and
 * edits its own copy from then on — so correcting a label here next year cannot
 * rewrite what a programme two years ago says was on channel 6.
 */
export function Desks({ desks, canEdit }: { desks: DeskRow[]; canEdit: boolean }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"analog" | "digital">("analog");
  const [channels, setChannels] = useState("20");
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const say = (res: { ok: boolean; error?: string }, good: string) =>
    setMessage(res.ok ? { ok: true, text: good } : { ok: false, text: res.error ?? "Failed." });

  return (
    <div className="grid gap-3">
      {desks.length === 0 ? (
        <p className="text-sm text-on-surface-muted">No desks yet.</p>
      ) : (
        <ul className="grid gap-2">
          {desks.map((desk) => (
            <li key={desk.id} className="rounded-[10px] border border-rule-surface p-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={open === desk.id}
                  onClick={() => setOpen(open === desk.id ? null : desk.id)}
                >
                  <span className="font-medium">{desk.name}</span>
                  <span className="ml-2 text-xs text-on-surface-muted">
                    {desk.kind === "analog" ? "analog" : "digital"} · {desk.channels.length} channels
                    {desk.usedBy > 0
                      ? ` · used by ${desk.usedBy} programme${desk.usedBy === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </button>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="h-8 text-xs"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Remove "${desk.name}"?`)) return;
                      startTransition(async () => {
                        const res = await removeDesk({ id: desk.id });
                        say(
                          res,
                          res.ok && res.usedBy > 0
                            ? `Removed "${desk.name}". The ${res.usedBy} programme${res.usedBy === 1 ? "" : "s"} that used it keep their own channels.`
                            : `Removed "${desk.name}".`,
                        );
                      });
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>

              {open === desk.id ? (
                <ul className="mt-2 grid gap-1 border-t border-rule-surface pt-2">
                  {desk.channels.map((c) => (
                    <ChannelRow key={c.id} channel={c} canEdit={canEdit} onMessage={setMessage} />
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New desk, e.g. Yamaha MG20XU"
            aria-label="New desk name"
            className="h-9 w-56"
          />
          <select
            value={kind}
            aria-label="Desk kind"
            className="h-9 rounded-key border border-rule-surface bg-field px-2 text-sm"
            onChange={(e) => setKind(e.target.value as "analog" | "digital")}
          >
            <option value="analog">analog</option>
            <option value="digital">digital</option>
          </select>
          <Input
            value={channels}
            onChange={(e) => setChannels(e.target.value)}
            aria-label="How many channels"
            inputMode="numeric"
            className="h-9 w-20"
          />
          <span className="text-xs text-on-surface-muted">channels</span>
          <Button
            type="button"
            variant="primary"
            className="h-9"
            disabled={pending || name.trim().length === 0}
            onClick={() =>
              startTransition(async () => {
                const res = await addDesk({
                  name,
                  kind,
                  channels: Number(channels) || 0,
                });
                say(res, `Added "${name.trim()}".`);
                if (res.ok) setName("");
              })
            }
          >
            Add
          </Button>
        </div>
      ) : null}

      {message ? (
        <p role="status" className={message.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function ChannelRow({
  channel,
  canEdit,
  onMessage,
}: {
  channel: { id: string; number: number; label: string; kind: string };
  canEdit: boolean;
  onMessage: (m: { ok: boolean; text: string } | null) => void;
}) {
  const [label, setLabel] = useState(channel.label);
  const [kind, setKind] = useState(channel.kind);
  const [pending, startTransition] = useTransition();

  const save = (nextLabel: string, nextKind: string) =>
    startTransition(async () => {
      const res = await updateDeskChannel({
        id: channel.id,
        label: nextLabel,
        kind: nextKind as (typeof KINDS)[number],
      });
      if (!res.ok) onMessage({ ok: false, text: res.error });
    });

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="w-8 shrink-0 text-right font-mono text-xs text-on-surface-muted">
        {channel.number}
      </span>
      {canEdit ? (
        <>
          <Input
            value={label}
            aria-label={`Label for channel ${channel.number}`}
            className="h-8 w-44"
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label !== channel.label && save(label, kind)}
          />
          <select
            value={kind}
            aria-label={`What channel ${channel.number} carries`}
            disabled={pending}
            className="h-8 rounded-key border border-rule-surface bg-field px-2 text-xs"
            onChange={(e) => {
              setKind(e.target.value);
              save(label, e.target.value);
            }}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span>
          {channel.label}
          <span className="ml-2 text-xs text-on-surface-muted">{channel.kind}</span>
        </span>
      )}
    </li>
  );
}

"use client";

import Link from "next/link";
import { DeitySymbols } from "@/components/DeitySymbol";
import { useMicCushions, cushionTint } from "@/components/MicCushions";
import { MIC_COLOURS } from "@/lib/micCushion";

export type LiveSlot = {
  position: number;
  singerId: string | null;
  singerName: string;
  bhajanTitle: string;
  bhajanId: string | null;
  deities: string[];
  confirmedPitch: string | null;
  tablaPitch: string | null;
};

export type LiveInstrument = { instrument: string; person: string | null };

/**
 * The performance view: what the harmonium, tabla and sound desk actually read
 * during a session.
 *
 * Rendered as a fixed overlay rather than an ordinary page. The root layout
 * gives every page the sidebar and the site header, and this view is meant to
 * be the whole screen — covering them is far more robust than trying to hide
 * them from a child route, and Escape or the exit button returns.
 *
 * Everything editable is deliberately absent. The one thing that stays LIVE is
 * the mic cushion colour, which is the piece that genuinely changes mid-session
 * and which the sound desk is watching for.
 */
export function LiveBoard({
  sessionId,
  heading,
  subheading,
  slots,
  instruments,
}: {
  sessionId: string;
  heading: string;
  subheading: string;
  slots: LiveSlot[];
  instruments: LiveInstrument[];
}) {
  const cushions = useMicCushions(sessionId);

  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-ground text-on-ground">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">
        {/*
          Deliberately quiet. On this screen the bhajan and the pitch are the
          content; the date is orientation you read once. It stays full
          contrast and unabbreviated so it is never ambiguous which session is
          on screen — small, not faint.
        */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule pb-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            <h1 className="text-[15px] font-semibold tracking-tight sm:text-base">{heading}</h1>
            <p className="text-xs text-on-ground-muted">{subheading}</p>
          </div>
          <Link
            href={`/roster/${sessionId}`}
            className="inline-flex h-7 shrink-0 items-center rounded-full border border-rule bg-surface px-3 text-xs font-medium text-on-surface-muted hover:border-brass/50 hover:text-on-surface"
          >
            Exit
          </Link>
        </header>

        <ol className="grid gap-2.5">
          {slots.map((s) => {
            const tint = cushionTint(cushions.get(s.singerId ?? "")?.colour ?? null);
            const dot = MIC_COLOURS.find(
              (c) => c.value === cushions.get(s.singerId ?? "")?.colour,
            );
            return (
              <li
                key={s.position}
                className="rounded-[14px] border border-card-edge bg-surface p-4 sm:p-5"
                style={
                  tint ? { background: tint.row, boxShadow: `inset 5px 0 0 0 ${tint.edge}` } : undefined
                }
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0 flex-1">
                    {/* Bhajan — the biggest thing on the row, as asked. */}
                    <div className="flex items-center gap-2.5">
                      <span className="shrink-0 font-mono text-sm text-on-surface-muted">
                        {s.position}
                      </span>
                      <DeitySymbols deities={s.deities} size={22} />
                      <h2 className="min-w-0 break-words font-display text-2xl font-semibold leading-tight sm:text-[28px]">
                        {s.bhajanTitle}
                      </h2>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1">
                      <span className="text-lg font-medium sm:text-xl">{s.singerName}</span>
                      {dot ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs text-on-surface-muted"
                          title={`${dot.label} mic cushion`}
                        >
                          <span
                            aria-hidden
                            className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-black/20"
                            style={{ background: dot.dot }}
                          />
                          {dot.label} mic
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Confirmed pitch — the other thing that has to read from a
                      distance. Tabla sits under it, quietly. */}
                  <div className="flex shrink-0 items-end gap-4 sm:flex-col sm:items-end sm:gap-1">
                    <div className="rounded-[12px] border-2 border-brass/45 bg-field px-3 py-1.5 font-mono text-2xl font-semibold leading-none sm:text-[30px]">
                      {s.confirmedPitch ?? "—"}
                    </div>
                    <div className="text-sm text-on-surface-muted">
                      tabla <span className="font-mono">{s.tablaPitch ?? "—"}</span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
          {slots.length === 0 ? (
            <li className="rounded-[14px] border border-card-edge bg-surface p-5 text-on-surface-muted">
              No bhajans on this session yet.
            </li>
          ) : null}
        </ol>

        {instruments.length > 0 ? (
          <section className="mt-5 rounded-[14px] border border-card-edge bg-surface p-4 sm:p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-on-surface-muted">
              Instruments
            </h2>
            <ul className="flex flex-wrap gap-x-8 gap-y-2">
              {instruments.map((i, idx) => (
                <li key={idx} className="text-lg">
                  <span className="text-on-surface-muted">{i.instrument}</span>{" "}
                  <span className="font-medium">{i.person ?? "—"}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

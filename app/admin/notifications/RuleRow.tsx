"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { describeRule, ruleProblem, clock } from "@/lib/nudgeRules";
import { saveNotificationRule, clearNotificationRule } from "./actions";

export type RuleRowValue = {
  firstHour: number;
  finalHour: number | null;
  stopAfterHour: number;
  enabled: boolean;
};

/**
 * One editable rule: the default, a weekday, or a single session.
 *
 * Every row says back, in words, what it will actually do — "First reminder
 * 7am, last one 9am. Nothing after 11am." Hours in boxes are exactly the sort
 * of setting that gets entered wrong once and never looked at again, and the
 * failure is silent: the reminders simply do not arrive, which reads as the
 * feature being broken rather than as a rule being wrong.
 *
 * The sentence updates as you change the boxes, before saving, so a mistake is
 * visible at the moment it is made.
 */
export function RuleRow({
  scope,
  weekday,
  sessionId,
  title,
  subtitle,
  initial,
  /** Rules that fall through show what they would inherit, and can be cleared. */
  inherited,
}: {
  scope: "default" | "weekday" | "session";
  weekday: number | null;
  sessionId: string | null;
  title: string;
  subtitle?: string;
  initial: RuleRowValue | null;
  inherited?: string;
}) {
  const [value, setValue] = useState<RuleRowValue>(
    initial ?? { firstHour: 15, finalHour: 17, stopAfterHour: 20, enabled: true },
  );
  const [own, setOwn] = useState(initial !== null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const problem = ruleProblem(value);

  const set = (patch: Partial<RuleRowValue>) => {
    setValue((v) => ({ ...v, ...patch }));
    setResult(null);
  };

  const save = () =>
    startTransition(async () => {
      const res = await saveNotificationRule({ scope, weekday, sessionId, ...value });
      setResult(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      if (res.ok) setOwn(true);
    });

  const clear = () =>
    startTransition(async () => {
      if (scope === "default") return;
      const res = await clearNotificationRule({ scope, weekday, sessionId });
      if (res.ok) {
        setOwn(false);
        setResult({ ok: true, text: "Cleared — falls back to the rule above." });
      } else {
        setResult({ ok: false, text: res.error });
      }
    });

  return (
    <div className="grid gap-2 rounded-[12px] border border-rule-surface bg-panel p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? <p className="text-xs text-on-surface-muted">{subtitle}</p> : null}
        </div>
        {!own && inherited ? (
          <span className="text-[11px] text-on-surface-muted">follows: {inherited}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-[11px] text-on-surface-muted">
          First reminder
          <select
            value={value.firstHour}
            onChange={(e) => set({ firstHour: Number(e.target.value) })}
            className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {clock(h)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-[11px] text-on-surface-muted">
          Last reminder
          <select
            value={value.finalHour ?? ""}
            onChange={(e) =>
              set({ finalHour: e.target.value === "" ? null : Number(e.target.value) })
            }
            className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
          >
            <option value="">none</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {clock(h)}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-[11px] text-on-surface-muted">
          Nothing after
          <select
            value={value.stopAfterHour}
            onChange={(e) => set({ stopAfterHour: Number(e.target.value) })}
            className="h-9 rounded-[10px] border border-rule-surface bg-field px-2 text-sm text-on-surface"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {clock(h)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 pb-2 text-xs">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="h-4 w-4"
          />
          Send reminders
        </label>

        <Button
          type="button"
          variant="primary"
          className="h-9"
          disabled={pending || problem !== null}
          onClick={save}
        >
          {pending ? "Saving…" : "Save"}
        </Button>

        {scope !== "default" && own ? (
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="pb-2 text-xs text-on-surface-muted underline underline-offset-2 hover:text-on-surface"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p
        className={[
          "text-xs",
          problem ? "text-warn" : "text-on-surface-muted",
        ].join(" ")}
      >
        {problem ?? describeRule(value)}
      </p>

      {result ? (
        <p role="status" className={result.ok ? "text-xs text-brass-ink" : "text-xs text-warn"}>
          {result.text}
        </p>
      ) : null}
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

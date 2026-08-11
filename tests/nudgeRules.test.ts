import { describe, expect, it } from "vitest";
import {
  BUILT_IN_RULE,
  clock,
  describeRule,
  dueNudgeUnder,
  resolveRule,
  ruleProblem,
  weekdayOfISO,
  type ScopedRule,
} from "@/lib/nudgeRules";

const rule = (
  scope: ScopedRule["scope"],
  over: Partial<ScopedRule> = {},
): ScopedRule => ({
  scope,
  weekday: null,
  sessionId: null,
  firstHour: 15,
  finalHour: 17,
  stopAfterHour: 20,
  enabled: true,
  ...over,
});

describe("resolveRule", () => {
  it("falls back to 3pm and 5pm when nothing is configured", () => {
    expect(resolveRule([], { id: "s1", weekday: 4 })).toEqual(BUILT_IN_RULE);
  });

  it("prefers the session's own rule over its weekday's", () => {
    const rules = [
      rule("default"),
      rule("weekday", { weekday: 0, firstHour: 7, finalHour: 9, stopAfterHour: 11 }),
      rule("session", { sessionId: "s1", firstHour: 6, finalHour: null, stopAfterHour: 10 }),
    ];
    expect(resolveRule(rules, { id: "s1", weekday: 0 }).firstHour).toBe(6);
  });

  it("prefers a weekday rule over the default", () => {
    const rules = [
      rule("default", { firstHour: 15 }),
      rule("weekday", { weekday: 0, firstHour: 7 }),
    ];
    expect(resolveRule(rules, { id: "s1", weekday: 0 }).firstHour).toBe(7);
    // A Thursday still gets the default.
    expect(resolveRule(rules, { id: "s2", weekday: 4 }).firstHour).toBe(15);
  });

  it("lets a disabled scope stop resolution rather than fall through", () => {
    // Switching Sundays off has to mean off. If absence were the only way to
    // say "no rule", a disabled Sunday would inherit the 3pm default and send
    // anyway — the exact opposite of what was asked.
    const rules = [rule("default"), rule("weekday", { weekday: 0, enabled: false })];
    expect(resolveRule(rules, { id: "s1", weekday: 0 }).enabled).toBe(false);
    expect(dueNudgeUnder(resolveRule(rules, { id: "s1", weekday: 0 }), 15, [])).toBeNull();
  });
});

describe("dueNudgeUnder", () => {
  const morning = { firstHour: 7, finalHour: 9, stopAfterHour: 11, enabled: true };

  it("works to a morning session's hours", () => {
    expect(dueNudgeUnder(morning, 6, [])).toBeNull();
    expect(dueNudgeUnder(morning, 7, [])).toBe("nudge");
    expect(dueNudgeUnder(morning, 9, ["nudge"])).toBe("nudge_final");
    expect(dueNudgeUnder(morning, 11, [])).toBeNull();
    // 3pm, which would have been the first reminder before any of this.
    expect(dueNudgeUnder(morning, 15, [])).toBeNull();
  });

  it("sends only once when there is no final hour", () => {
    const once = { firstHour: 15, finalHour: null, stopAfterHour: 20, enabled: true };
    expect(dueNudgeUnder(once, 15, [])).toBe("nudge");
    expect(dueNudgeUnder(once, 19, ["nudge"])).toBeNull();
  });

  it("never resends what has already gone", () => {
    // Sailavan chose that editing a rule must not re-buzz anybody.
    expect(dueNudgeUnder(morning, 9, ["nudge", "nudge_final"])).toBeNull();
  });

  it("still covers a missed first run at the final hour", () => {
    expect(dueNudgeUnder(morning, 10, [])).toBe("nudge_final");
  });
});

describe("ruleProblem", () => {
  it("passes a sane rule", () => {
    expect(ruleProblem({ firstHour: 15, finalHour: 17, stopAfterHour: 20, enabled: true })).toBeNull();
    expect(ruleProblem({ firstHour: 7, finalHour: null, stopAfterHour: 11, enabled: true })).toBeNull();
  });

  it("catches a rule that could never fire", () => {
    expect(
      ruleProblem({ firstHour: 18, finalHour: null, stopAfterHour: 17, enabled: true }),
    ).toMatch(/would ever send/);
  });

  it("catches a last reminder before the first", () => {
    expect(
      ruleProblem({ firstHour: 17, finalHour: 15, stopAfterHour: 20, enabled: true }),
    ).toMatch(/after the first/);
  });

  it("catches a last reminder past the stop hour", () => {
    expect(
      ruleProblem({ firstHour: 7, finalHour: 12, stopAfterHour: 11, enabled: true }),
    ).toMatch(/never send/);
  });

  it("catches hours outside the day", () => {
    expect(ruleProblem({ firstHour: 25, finalHour: null, stopAfterHour: 20, enabled: true })).toMatch(
      /between 0 and 23/,
    );
  });
});

describe("describeRule", () => {
  it("says back what will happen", () => {
    expect(describeRule({ firstHour: 15, finalHour: 17, stopAfterHour: 20, enabled: true })).toBe(
      "First reminder 3pm, last one 5pm. Nothing after 8pm.",
    );
    expect(describeRule({ firstHour: 7, finalHour: null, stopAfterHour: 11, enabled: true })).toBe(
      "First reminder 7am, and no second one. Nothing after 11am.",
    );
    expect(describeRule({ firstHour: 7, finalHour: 9, stopAfterHour: 11, enabled: false })).toBe(
      "No reminders at all.",
    );
  });

  it("names midnight and noon rather than 0am and 12pm", () => {
    expect(clock(0)).toBe("midnight");
    expect(clock(12)).toBe("noon");
    expect(clock(13)).toBe("1pm");
    expect(clock(11)).toBe("11am");
  });
});

describe("weekdayOfISO", () => {
  it("reads the session's own day", () => {
    expect(weekdayOfISO("2026-08-13")).toBe(4); // a Thursday
    expect(weekdayOfISO("2026-08-16")).toBe(0); // a Sunday
  });
});

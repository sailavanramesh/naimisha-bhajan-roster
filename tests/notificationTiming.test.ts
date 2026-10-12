import { describe, expect, it } from "vitest";
import { changeNoticesClosed, sessionStart, CHANGE_NOTICE_CUTOFF_MINUTES } from "@/lib/nudgeRules";
import { lyricFlagNoticeDue } from "@/lib/lyricFlags";
import { lyricFlagNotification } from "@/lib/notify";

/*
 * Every instant below is written in UTC and worked out by hand, so a test that
 * passes is the app agreeing with a calendar rather than with itself.
 *
 * Melbourne in 2026–27: AEST (UTC+10) until 2am Sunday 4 October 2026, AEDT
 * (UTC+11) from then until 3am Sunday 4 April 2027, AEST again after. India is
 * UTC+5:30 all year. Sydney keeps Melbourne's clock.
 */
const MEL = "Australia/Melbourne";
const at = (iso: string) => new Date(iso);
const session = (dateISO: string, startsAt: string | null, timeZone = MEL) => ({ dateISO, startsAt, timeZone });

describe("sessionStart", () => {
  it("reads 7pm in winter as UTC+10", () => {
    expect(sessionStart(session("2026-08-20", "19:00"))?.toISOString()).toBe("2026-08-20T09:00:00.000Z");
  });

  it("reads 7pm in summer as UTC+11", () => {
    expect(sessionStart(session("2026-10-15", "19:00"))?.toISOString()).toBe("2026-10-15T08:00:00.000Z");
  });

  it("gets the morning the clocks go forward right", () => {
    // 10am on Sunday 4 October is already AEDT: the change was at 2am.
    expect(sessionStart(session("2026-10-04", "10:00"))?.toISOString()).toBe("2026-10-03T23:00:00.000Z");
  });

  it("gets the evening the clocks go back right", () => {
    // 7pm on Sunday 4 April 2027 is AEST again: the change was at 3am.
    expect(sessionStart(session("2027-04-04", "19:00"))?.toISOString()).toBe("2027-04-04T09:00:00.000Z");
  });

  it("reads a session with no time as the usual 7pm", () => {
    expect(sessionStart(session("2026-10-15", null))?.toISOString()).toBe("2026-10-15T08:00:00.000Z");
  });

  it("uses the session's own zone", () => {
    expect(sessionStart(session("2026-10-15", "19:00", "Asia/Kolkata"))?.toISOString()).toBe(
      "2026-10-15T13:30:00.000Z",
    );
    expect(sessionStart(session("2026-10-15", "19:00", "Australia/Sydney"))?.toISOString()).toBe(
      "2026-10-15T08:00:00.000Z",
    );
  });
});

describe("changeNoticesClosed — an hour after the start, saves go quiet", () => {
  it("is an hour", () => {
    expect(CHANGE_NOTICE_CUTOFF_MINUTES).toBe(60);
  });

  it("winter: open at 7:59pm, closed at 8pm", () => {
    const s = session("2026-08-20", "19:00");
    expect(changeNoticesClosed(s, at("2026-08-20T09:59:00.000Z"))).toBe(false);
    expect(changeNoticesClosed(s, at("2026-08-20T10:00:00.000Z"))).toBe(true);
  });

  it("summer: open at 7:59pm, closed at 8pm — an hour earlier in UTC", () => {
    const s = session("2026-10-15", "19:00");
    expect(changeNoticesClosed(s, at("2026-10-15T08:59:00.000Z"))).toBe(false);
    expect(changeNoticesClosed(s, at("2026-10-15T09:00:00.000Z"))).toBe(true);
    // A fixed +10 would still call this 7pm and keep sending.
    expect(changeNoticesClosed(s, at("2026-10-15T09:30:00.000Z"))).toBe(true);
  });

  it("stays open before and during the first hour", () => {
    const s = session("2026-10-15", "18:30");
    expect(changeNoticesClosed(s, at("2026-10-15T05:00:00.000Z"))).toBe(false); // 4pm
    expect(changeNoticesClosed(s, at("2026-10-15T07:45:00.000Z"))).toBe(false); // 6:45pm
    expect(changeNoticesClosed(s, at("2026-10-15T08:29:00.000Z"))).toBe(false); // 7:29pm
    expect(changeNoticesClosed(s, at("2026-10-15T08:30:00.000Z"))).toBe(true); // 7:30pm
  });

  it("the morning the clocks go forward", () => {
    const s = session("2026-10-04", "10:00");
    expect(changeNoticesClosed(s, at("2026-10-03T23:59:00.000Z"))).toBe(false); // 10:59am AEDT
    expect(changeNoticesClosed(s, at("2026-10-04T00:00:00.000Z"))).toBe(true); // 11am AEDT
  });

  it("a Chennai session closes on India's clock", () => {
    const s = session("2026-10-15", "19:00", "Asia/Kolkata");
    expect(changeNoticesClosed(s, at("2026-10-15T14:29:00.000Z"))).toBe(false); // 7:59pm IST
    expect(changeNoticesClosed(s, at("2026-10-15T14:30:00.000Z"))).toBe(true); // 8pm IST
  });

  it("a session with no time closes at 8pm", () => {
    const s = session("2026-10-15", null);
    expect(changeNoticesClosed(s, at("2026-10-15T08:59:00.000Z"))).toBe(false);
    expect(changeNoticesClosed(s, at("2026-10-15T09:00:00.000Z"))).toBe(true);
  });

  it("a session days away is never closed", () => {
    expect(changeNoticesClosed(session("2026-10-22", "19:00"), at("2026-10-15T09:00:00.000Z"))).toBe(false);
  });
});

describe("lyricFlagNoticeDue — about two hours before, from the hourly sweep", () => {
  // The sweep fires at five past the hour, Melbourne time.
  const startOf = (dateISO: string, startsAt: string, zone = MEL) => sessionStart(session(dateISO, startsAt, zone));

  it("7pm in summer goes at the 5pm sweep, not the 4pm one", () => {
    const start = startOf("2026-10-15", "19:00");
    expect(lyricFlagNoticeDue(start, at("2026-10-15T05:05:00.000Z"))).toBe(false); // 4:05pm, 2h55 ahead
    expect(lyricFlagNoticeDue(start, at("2026-10-15T06:05:00.000Z"))).toBe(true); // 5:05pm, 1h55 ahead
  });

  it("7pm in winter goes at the 5pm sweep too — the same wall clock", () => {
    const start = startOf("2026-08-20", "19:00");
    expect(lyricFlagNoticeDue(start, at("2026-08-20T06:05:00.000Z"))).toBe(false); // 4:05pm
    expect(lyricFlagNoticeDue(start, at("2026-08-20T07:05:00.000Z"))).toBe(true); // 5:05pm
  });

  it("6:30pm goes at the 4pm sweep, 2h25 ahead", () => {
    const start = startOf("2026-10-15", "18:30");
    expect(lyricFlagNoticeDue(start, at("2026-10-15T04:05:00.000Z"))).toBe(false); // 3:05pm, 3h25
    expect(lyricFlagNoticeDue(start, at("2026-10-15T05:05:00.000Z"))).toBe(true); // 4:05pm, 2h25
  });

  it("12:15pm goes at the 10am sweep", () => {
    const start = startOf("2026-10-18", "12:15");
    expect(lyricFlagNoticeDue(start, at("2026-10-17T22:05:00.000Z"))).toBe(false); // 9:05am, 3h10
    expect(lyricFlagNoticeDue(start, at("2026-10-17T23:05:00.000Z"))).toBe(true); // 10:05am, 2h10
  });

  it("the evening the clocks go back", () => {
    const start = startOf("2027-04-04", "19:00");
    expect(lyricFlagNoticeDue(start, at("2027-04-04T06:05:00.000Z"))).toBe(false); // 4:05pm AEST
    expect(lyricFlagNoticeDue(start, at("2027-04-04T07:05:00.000Z"))).toBe(true); // 5:05pm AEST
  });

  it("the morning the clocks go forward", () => {
    // 10am AEDT = 23:00Z the day before. The 8:05am sweep is 1h55 ahead.
    const start = startOf("2026-10-04", "10:00");
    expect(lyricFlagNoticeDue(start, at("2026-10-03T20:05:00.000Z"))).toBe(false); // 7:05am, 2h55
    expect(lyricFlagNoticeDue(start, at("2026-10-03T21:05:00.000Z"))).toBe(true); // 8:05am, 1h55
  });

  it("a late sweep still sends, right up to the start", () => {
    const start = startOf("2026-10-15", "19:00");
    expect(lyricFlagNoticeDue(start, at("2026-10-15T07:50:00.000Z"))).toBe(true); // 6:50pm
  });

  it("nothing once the session has begun", () => {
    const start = startOf("2026-10-15", "19:00");
    expect(lyricFlagNoticeDue(start, at("2026-10-15T08:00:00.000Z"))).toBe(false);
    expect(lyricFlagNoticeDue(start, at("2026-10-15T08:05:00.000Z"))).toBe(false);
  });

  it("a Chennai session on India's clock", () => {
    const start = startOf("2026-10-15", "19:00", "Asia/Kolkata"); // 13:30Z
    expect(lyricFlagNoticeDue(start, at("2026-10-15T10:59:00.000Z"))).toBe(false); // 2h31 ahead
    expect(lyricFlagNoticeDue(start, at("2026-10-15T11:30:00.000Z"))).toBe(true); // 2h ahead
  });

  it("nothing without a start", () => {
    expect(lyricFlagNoticeDue(null, at("2026-10-15T06:05:00.000Z"))).toBe(false);
  });
});

describe("lyricFlagNotification", () => {
  it("names the session's time, the bhajan and the words", () => {
    const n = lyricFlagNotification({
      sessionId: "s1",
      timeLabel: "7pm",
      hits: [{ position: 2, title: "Rama Rama", matched: "Rama" }],
    });
    expect(n.title).toBe("Flagged word in today's lyrics");
    expect(n.body).toBe('In the 7pm session: 2. Rama Rama: "Rama"');
    expect(n.url).toBe("/roster/s1");
    expect(n.alert).toBe(true);
  });

  it("lists several", () => {
    const n = lyricFlagNotification({
      sessionId: "s1",
      timeLabel: "",
      hits: [
        { position: 1, title: "A", matched: "x" },
        { position: 3, title: "B", matched: "y z" },
      ],
    });
    expect(n.title).toBe("Flagged words in today's lyrics");
    expect(n.body).toBe('In today\'s session: 1. A: "x"; 3. B: "y z"');
  });
});

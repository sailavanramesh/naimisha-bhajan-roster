import { describe, it, expect } from "vitest";
import {
  jobBanner,
  jobsOf,
  jobHref,
  resolveSessionView,
  sessionHref,
  JOB_LABELS,
  runsSound,
} from "../lib/sessionView";

describe("sessionHref", () => {
  it("sends a bhajan session to the roster and a program to the program page", () => {
    expect(sessionHref("s1", "bhajans")).toBe("/roster/s1");
    expect(sessionHref("s1", "program")).toBe("/program/s1");
  });
});

describe("jobHref", () => {
  it("sends the sound engineer of a bhajan session to the live board", () => {
    expect(jobHref("s1", "bhajans", "soundEngineer")).toBe("/roster/s1/live");
    expect(jobHref("s1", "bhajans", "micCoordinator")).toBe("/roster/s1/live");
  });

  it("has no view for a program desk yet, and says so rather than inventing a route", () => {
    // The program desk view arrives with the channel work. Until then this
    // must return null so the resolver falls back to the running order.
    expect(jobHref("s1", "program", "soundEngineer")).toBeNull();
  });
});

describe("resolveSessionView", () => {
  it("leaves somebody with no job on the ordinary page", () => {
    expect(resolveSessionView({ sessionId: "s1", format: "bhajans", jobs: [] })).toEqual({
      href: "/roster/s1",
      forJob: null,
    });
  });

  it("lands the sound engineer on the live board, and says why", () => {
    expect(
      resolveSessionView({ sessionId: "s1", format: "bhajans", jobs: ["soundEngineer"] }),
    ).toEqual({ href: "/roster/s1/live", forJob: "soundEngineer" });
  });

  it("gives sound the desk when somebody holds both jobs", () => {
    const view = resolveSessionView({
      sessionId: "s1",
      format: "bhajans",
      jobs: ["micCoordinator", "soundEngineer"],
    });
    expect(view.forJob).toBe("soundEngineer");
  });

  it("falls back to the running order for a program, since that view does not exist yet", () => {
    expect(
      resolveSessionView({ sessionId: "s1", format: "program", jobs: ["soundEngineer"] }),
    ).toEqual({ href: "/program/s1", forJob: null });
  });

  it("does not follow a job from one session onto another", () => {
    // The job is per session; nothing here can carry it across, and this
    // pins that down: the same person on a session they are not crewed on
    // gets the ordinary page.
    expect(resolveSessionView({ sessionId: "s2", format: "bhajans", jobs: [] }).forJob).toBeNull();
  });
});

describe("labels", () => {
  it("names both jobs in the group's words", () => {
    expect(JOB_LABELS.soundEngineer).toBe("Sound engineer");
    expect(JOB_LABELS.micCoordinator).toBe("Mic coordinator");
  });

  it("says why the screen is different", () => {
    expect(jobBanner("soundEngineer")).toBe("You are on sound.");
    expect(jobBanner("micCoordinator")).toBe("You are on mics.");
  });
});

describe("runsSound", () => {
  it("is true for the sound engineer and the mic coordinator", () => {
    expect(runsSound(["soundEngineer"])).toBe(true);
    expect(runsSound(["micCoordinator"])).toBe(true);
    expect(runsSound(["soundEngineer", "micCoordinator"])).toBe(true);
  });

  it("is false for somebody with no job on the night", () => {
    expect(runsSound([])).toBe(false);
  });
});

/*
 * The jobs come off the singer row now, not off a per-session crew table. The
 * order matters: sound engineer first is what makes it win in
 * resolveSessionView when somebody holds both.
 */
describe("jobsOf", () => {
  it("reads both jobs off the person, sound engineer first", () => {
    expect(jobsOf({ soundEngineer: true, micCoordinator: true })).toEqual([
      "soundEngineer",
      "micCoordinator",
    ]);
    expect(jobsOf({ soundEngineer: false, micCoordinator: true })).toEqual(["micCoordinator"]);
    expect(jobsOf({ soundEngineer: true, micCoordinator: false })).toEqual(["soundEngineer"]);
  });

  it("gives nothing for somebody with no job, and for nobody at all", () => {
    expect(jobsOf({ soundEngineer: false, micCoordinator: false })).toEqual([]);
    expect(jobsOf({})).toEqual([]);
    expect(jobsOf(null)).toEqual([]);
    expect(jobsOf(undefined)).toEqual([]);
  });

  it("feeds resolveSessionView straight through", () => {
    const me = { soundEngineer: false, micCoordinator: true };
    expect(
      resolveSessionView({ sessionId: "s1", format: "bhajans", jobs: jobsOf(me) }),
    ).toEqual({ href: "/roster/s1/live", forJob: "micCoordinator" });
  });
});

import { describe, it, expect } from "vitest";
import { can, canWithGrants, ROLES, type Capability } from "@/lib/capabilities";

describe("canWithGrants", () => {
  it("lets a named member edit the words, and nothing else", () => {
    expect(canWithGrants("member", "editSongWords", { canEditWords: true })).toBe(true);
    // The whole point of the grant: it buys the words and not the roster.
    expect(canWithGrants("member", "assignSingers", { canEditWords: true })).toBe(false);
    expect(canWithGrants("member", "editPrograms", { canEditWords: true })).toBe(false);
    expect(canWithGrants("member", "buildSessions", { canEditWords: true })).toBe(false);
  });

  /*
   * The two sound jobs. Both unlock the same capability and nothing else — the
   * desk and its cushion allocation, without the roster that being an editor
   * would carry with it.
   */
  it("lets either sound job manage the desks, and nothing else", () => {
    for (const job of ["soundEngineer", "micCoordinator"] as const) {
      expect(canWithGrants("member", "manageDesks", { [job]: true })).toBe(true);
      expect(canWithGrants("member", "assignSingers", { [job]: true })).toBe(false);
      expect(canWithGrants("member", "editPrograms", { [job]: true })).toBe(false);
      expect(canWithGrants("member", "editSongWords", { [job]: true })).toBe(false);
    }
  });

  it("does not let the words grant reach the desks, or the other way round", () => {
    expect(canWithGrants("member", "manageDesks", { canEditWords: true })).toBe(false);
    expect(canWithGrants("member", "editSongWords", { soundEngineer: true })).toBe(false);
  });

  it("keeps the guide and the archive to the owner, grant or no grant", () => {
    expect(can("owner", "editGuide")).toBe(true);
    expect(can("editor", "editGuide")).toBe(false);
    // An editor archives; only an owner restores or finally deletes.
    expect(can("owner", "manageArchive")).toBe(true);
    expect(can("editor", "manageArchive")).toBe(false);
    expect(can("editor", "buildSessions")).toBe(true);
    expect(
      canWithGrants("editor", "editGuide", { soundEngineer: true, canEditWords: true }),
    ).toBe(false);
  });

  it("leaves a member without the grant exactly where they were", () => {
    expect(canWithGrants("member", "editSongWords", { canEditWords: false })).toBe(false);
    expect(canWithGrants("member", "editSongWords", null)).toBe(false);
    expect(canWithGrants("member", "editSongWords", undefined)).toBe(false);
  });

  it("can only ever add — a grant never takes a capability away", () => {
    // An editor keeps everything whatever the grants say, including a grant
    // explicitly set to false.
    const everything = new Set<Capability>();
    for (const role of ROLES) {
      for (const capability of CAPABILITIES) {
        if (can(role, capability)) everything.add(capability);
      }
    }
    for (const capability of everything) {
      if (!can("editor", capability)) continue;
      expect(canWithGrants("editor", capability, { canEditWords: false })).toBe(true);
    }
  });

  it("gives a viewer nothing, granted or not", () => {
    // A viewer is somebody who has not signed in. There is no person to grant
    // anything to, which is why the grant lives on Singer.
    expect(canWithGrants("viewer", "editSongWords", { canEditWords: true })).toBe(true);
    // ^ true only because the caller said so; lib/auth.ts never passes a grant
    // for somebody it could not resolve to a Singer row. Documented here so the
    // guarantee is read as belonging to canWithGrantsFor, not to this function.
    expect(canWithGrants("viewer", "editSongWords", null)).toBe(false);
  });

  it("agrees with can() for every role and capability when there are no grants", () => {
    for (const role of ROLES) {
      for (const capability of CAPABILITIES) {
        expect(canWithGrants(role, capability, null), `${role}: ${capability}`).toBe(
          can(role, capability),
        );
      }
    }
  });
});

/** Every capability, listed so the sweep above cannot silently miss a new one. */
const CAPABILITIES: Capability[] = [
  "buildSessions",
  "manageAllocations",
  "editSessionNotes",
  "assignSingers",
  "editSlotBhajan",
  "editConfirmedPitch",
  "addBhajan",
  "exploreBhajans",
  "manageOwnLearning",
  "setMicCushion",
  "notifySingers",
  "manageNotificationRules",
  "editPrograms",
  "editSongWords",
  "manageDesks",
  "editGuide",
  "manageArchive",
  "viewAllPages",
];

/**
 * The 2026-08-20 production bug, pinned.
 *
 * A member saw an editable pitch field in the roster grid — the grid's gate is
 * `editSlotBhajan`, which they have — typed a pitch, was told the save had
 * worked, and had the value silently replaced from the database, because
 * app/roster/[id]/actions.ts reverted `confirmedPitch` for anybody without
 * `assignSingers`. Nothing failed; the edit simply never happened.
 *
 * The action now asks about `editConfirmedPitch` on its own. These two
 * assertions are the halves that have to stay in step: a member may record a
 * pitch, and still may not move singers between slots.
 */
describe("a member recording a confirmed pitch", () => {
  it("may edit the pitch, which the roster grid has always offered them", () => {
    expect(can("member", "editConfirmedPitch")).toBe(true);
    expect(can("member", "editSlotBhajan")).toBe(true);
  });

  it("still may not change who is in a slot", () => {
    expect(can("member", "assignSingers")).toBe(false);
  });

  it("leaves a viewer able to do neither", () => {
    expect(can("viewer", "editConfirmedPitch")).toBe(false);
    expect(can("viewer", "editSlotBhajan")).toBe(false);
  });
});

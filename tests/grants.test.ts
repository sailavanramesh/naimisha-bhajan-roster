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
  "viewAllPages",
];

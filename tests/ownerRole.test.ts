import { describe, expect, it } from "vitest";
import { can, canSeePage, ROLES, ROLE_LABELS } from "@/lib/capabilities";

describe("the owner role", () => {
  it("can do everything an editor can", () => {
    // An owner is an editor plus one thing. If a capability is ever added to
    // editor and not to owner, the owner quietly loses it — this is the guard.
    const everything = [
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
      "viewAllPages",
    ] as const;
    for (const capability of everything) {
      expect(can("editor", capability), `editor: ${capability}`).toBe(true);
      expect(can("owner", capability), `owner: ${capability}`).toBe(true);
    }
  });

  it("is the only role that may change the notification rules", () => {
    expect(can("owner", "manageNotificationRules")).toBe(true);
    expect(can("editor", "manageNotificationRules")).toBe(false);
    expect(can("member", "manageNotificationRules")).toBe(false);
    expect(can("viewer", "manageNotificationRules")).toBe(false);
  });

  it("can reach the admin pages", () => {
    // canSeePage used to read `role === "editor"`, which locked owners out of
    // every page an editor can see — the exact failure that adding a role
    // above editor invites.
    expect(canSeePage("owner", "/admin")).toBe(true);
    expect(canSeePage("owner", "/admin/notifications")).toBe(true);
    expect(canSeePage("editor", "/admin/notifications")).toBe(true);
    expect(canSeePage("member", "/admin/notifications")).toBe(false);
  });

  it("is listed and labelled", () => {
    expect(ROLES).toContain("owner");
    expect(ROLE_LABELS.owner).toBe("Owner");
  });
});

/**
 * lib/capabilities.ts — who may do what.
 *
 * Pure. No Prisma, no next-auth, no cookies.
 *
 * Split out of lib/auth.ts so it can be tested: that module reaches for
 * next-auth at import time, which cannot load under vitest, so the one part of
 * authorisation worth pinning down had no tests at all. Everything here is a
 * plain function of a role.
 *
 * lib/auth.ts re-exports all of it, so nothing else had to change.
 */

export const ROLES = ["owner", "editor", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  member: "Member",
  viewer: "Read-only",
};

/**
 * Every distinct thing a person can do. Adding a capability here and checking
 * it at the point of use is what keeps authorisation out of the UI layer —
 * hiding a button is not a permission.
 */
export type Capability =
  | "buildSessions" // generate and save sessions
  | "manageAllocations" // /admin: instrument eligibility, singer repertoire
  | "editSessionNotes"
  | "assignSingers" // who sings what
  | "editSlotBhajan" // which bhajan is in a slot
  | "editConfirmedPitch"
  | "addBhajan"
  | "exploreBhajans" // browse a randomised slice of the masterlist
  | "manageOwnLearning" // keep a personal learning list
  | "setMicCushion" // mark which colour mic cushion a singer is on
  | "notifySingers" // send somebody a reminder about a session by hand
  | "manageNotificationRules" // owner only: when the day-of reminders go out
  | "editPrograms" // build a music program: its running order, performers, crew
  | "editSongWords" // lyrics and meanings in the song catalogue
  | "manageDesks" // the desks, their strips, and which cushion is on which channel
  | "viewAllPages";

const EDITOR_CAPABILITIES: Capability[] = [
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
  // Its own capability rather than folding into buildSessions: a program is
  // curated by hand from end to end, where a bhajan session is generated and
  // then corrected. Nothing about being allowed to run the generator implies
  // being the person who decides a Guru Poornima running order.
  "editPrograms",
  "editSongWords",
  "manageDesks",
  "viewAllPages",
];

const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  // An owner is an editor plus the notification rules. Spelled out from the
  // same list so the two can never drift apart.
  owner: new Set<Capability>([...EDITOR_CAPABILITIES, "manageNotificationRules"]),
  editor: new Set<Capability>(EDITOR_CAPABILITIES),
  member: new Set<Capability>([
    // Sailavan: "only be able to edit the bhajan column, can't change the
    // allocation of singers." Taken literally — confirmed pitch is left to an
    // editor too. See OPEN-QUESTIONS in PROGRESS.md.
    "editSlotBhajan",
    "exploreBhajans",
    "manageOwnLearning",
    // Sailavan: any user sets this. It is live sound-desk state, not the
    // historical record, so it sits outside the editor-only allocation rules.
    "setMicCushion",
  ]),
  viewer: new Set<Capability>(),
};

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].has(capability);
}

/**
 * What one PERSON may be granted beyond their role.
 *
 * Two things so far, and both for the same reason. Sailavan wanted named people
 * keeping the lyrics up to date, and the sound person keeping the desk and its
 * cushion allocation right, without handing either of them the roster — and the
 * four roles are a ladder, so the only way to give somebody one of those was to
 * make them an editor, which is far more power than was meant.
 *
 * Deliberately a separate, additive check rather than a fifth role: roles stay
 * a ladder that can be reasoned about, and a grant can only ever ADD. Nothing
 * here can take a capability away from a role that has it.
 */
export type Grants = {
  canEditWords?: boolean;
  canRunSound?: boolean;
};

const GRANTED: Record<keyof Grants, Capability> = {
  canEditWords: "editSongWords",
  canRunSound: "manageDesks",
};

export function canWithGrants(
  role: Role,
  capability: Capability,
  grants?: Grants | null,
): boolean {
  if (can(role, capability)) return true;
  if (!grants) return false;

  for (const [grant, granted] of Object.entries(GRANTED) as Array<
    [keyof Grants, Capability]
  >) {
    if (grants[grant] && granted === capability) return true;
  }
  return false;
}

/** Pages a member may reach. Everything else is owner/editor only. */
export const MEMBER_PAGES = [
  "/roster",
  "/bhajans",
  "/singers",
  "/explore",
  "/my-list",
  // Members READ programs — they are singing in them. Editing is gated on
  // `editPrograms` at every action, which is what actually stops them.
  "/program",
  // And the words, which is the page a singer most wants on their phone.
  "/songs",
];

export function canSeePage(role: Role, path: string): boolean {
  // Keyed off the capability, not a role name. Written as `role === "editor"`
  // it silently locked owners out of every page an editor can see, which is
  // every page — the exact failure adding a role above editor invites.
  if (can(role, "viewAllPages")) return true;
  // Viewers and members share the same public reading surface.
  return MEMBER_PAGES.some((p) => path === p || path.startsWith(`${p}/`)) || path === "/";
}

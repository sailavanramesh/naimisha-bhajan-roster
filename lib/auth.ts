import { cookies } from "next/headers";
import { normaliseEmail } from "./email";
import { prisma } from "@/lib/db";
import { auth, googleSignInConfigured } from "@/lib/authConfig";

/**
 * lib/auth.ts — who may see and do what.
 *
 * Three levels. `viewer` is everybody who has not used an access link, so the
 * public site stays readable without a login (SPEC §4.H).
 *
 *   editor  — sees every page and edits everything in the app.
 *   member  — sees Roster, Bhajans and Singers. May change which bhajan is in
 *             a slot; may NOT move singers around.
 *   viewer  — reads the public pages. Changes nothing.
 *
 * There is deliberately no "owner": changing how the app itself works is a
 * code change, not a role.
 *
 * Until Google sign-in lands (SPEC §9.5) the role comes from which access link
 * was used. The capability checks below are the part that matters and do not
 * change when auth does — only `getRole` will.
 */

export const ROLES = ["editor", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
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
  | "viewAllPages";

const MATRIX: Record<Role, ReadonlySet<Capability>> = {
  editor: new Set<Capability>([
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
  ]),
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

/** Pages a member may reach. Everything else is owner/editor only. */
export const MEMBER_PAGES = ["/roster", "/bhajans", "/singers", "/explore", "/my-list"];

/**
 * Closed-testing mode.
 *
 * With REQUIRE_SIGN_IN=true nothing is readable without signing in — for a
 * soft launch with a handful of people before a wider release. Off by default,
 * because SPEC §4.H wants a public read-only session URL eventually.
 */
export const requireSignIn = process.env.REQUIRE_SIGN_IN === "true";

export function canSeePage(role: Role, path: string): boolean {
  if (role === "editor") return true;
  // Viewers and members share the same public reading surface.
  return MEMBER_PAGES.some((p) => path === p || path.startsWith(`${p}/`)) || path === "/";
}

/** The signed-in person, if any, resolved to a singer via the email allowlist. */
export async function getSignedInSinger(): Promise<{
  id: string;
  name: string;
  email: string;
  role: Role;
} | null> {
  if (!googleSignInConfigured) return null;
  const session = await auth().catch(() => null);
  const email = normaliseEmail(session?.user?.email);
  if (!email) return null;

  const singer = await prisma.singer.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
  // Signed in but not on the allowlist: a viewer, deliberately. Sign-in never
  // creates a singer.
  if (!singer?.email) return null;

  const role: Role = singer.role === "coordinator" ? "editor" : "member";
  return { id: singer.id, name: singer.name, email: singer.email, role };
}

export async function getRole(): Promise<Role> {
  // Google sign-in wins when it is configured and the person is on the
  // allowlist — an access link cannot escalate a named identity.
  const signedIn = await getSignedInSinger();
  if (signedIn) return signedIn.role;

  const store = await cookies();
  const value = store.get("role")?.value;
  if (value && (ROLES as readonly string[]).includes(value)) return value as Role;
  // A pre-existing `edit=1` cookie predates roles and meant full access.
  if (store.get("edit")?.value === "1") return "editor";
  return "viewer";
}

/**
 * Server-side gate for a mutating Server Action.
 *
 * `middleware.ts` only SETS the role cookie; it never blocks a direct POST to a
 * Server Action. Hiding a control in the UI is not authorisation, so every
 * mutating action calls this.
 */
export async function requireCapability(capability: Capability): Promise<Role> {
  const role = await getRole();
  if (!can(role, capability)) {
    throw new Error(
      `Your access level (${ROLE_LABELS[role]}) does not allow this. ` +
        `Ask the coordinator for a link with the right access.`,
    );
  }
  return role;
}

export { normaliseEmail };

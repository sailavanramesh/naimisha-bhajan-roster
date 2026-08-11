import { cookies } from "next/headers";
import { normaliseEmail } from "./email";
import { prisma } from "@/lib/db";
import { auth, googleSignInConfigured } from "@/lib/authConfig";
import { can, ROLES, ROLE_LABELS, type Role, type Capability } from "./capabilities";

/**
 * lib/auth.ts — who may see and do what.
 *
 * Four levels. `viewer` is everybody who has not used an access link, so the
 * public site stays readable without a login (SPEC §4.H).
 *
 *   owner   — an editor who also decides WHEN THE APP TALKS TO PEOPLE.
 *   editor  — sees every page and edits everything in the app.
 *   member  — sees Roster, Bhajans and Singers. May change which bhajan is in
 *             a slot; may NOT move singers around.
 *   viewer  — reads the public pages. Changes nothing.
 *
 * There was deliberately no "owner" until 2026-08-12, on the reasoning that
 * changing how the app works is a code change rather than a role. The
 * reminder hours broke that: most sessions are in the evening but some are in
 * the morning, and "3pm" being a deploy away meant the group would simply have
 * lived with reminders arriving after the session. Configuring when people get
 * buzzed is not the same power as editing a roster, so it got its own level
 * rather than being handed to every editor.
 *
 * Until Google sign-in lands (SPEC §9.5) the role comes from which access link
 * was used. The capability checks below are the part that matters and do not
 * change when auth does — only `getRole` will.
 */

export {
  ROLES,
  ROLE_LABELS,
  MEMBER_PAGES,
  can,
  canSeePage,
  type Role,
  type Capability,
} from "./capabilities";

/**
 * Closed-testing mode.
 *
 * With REQUIRE_SIGN_IN=true nothing is readable without signing in — for a
 * soft launch with a handful of people before a wider release. Off by default,
 * because SPEC §4.H wants a public read-only session URL eventually.
 */
export const requireSignIn = process.env.REQUIRE_SIGN_IN === "true";


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

  const role: Role =
    singer.role === "owner" ? "owner" : singer.role === "coordinator" ? "editor" : "member";
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

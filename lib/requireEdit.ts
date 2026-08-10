import { cookies } from "next/headers";

/**
 * Server-side edit gate for mutating Server Actions.
 *
 * `middleware.ts` only SETS the `edit` cookie when the right `?k=` is used; it
 * does not stop anyone POSTing to a Server Action directly. Hiding a button in
 * the UI is not authorisation, so every mutating action calls this.
 *
 * This is the EDIT_KEY mechanism from SPEC §4.I Phase 1. It stays until named
 * Google sign-in lands (Phase 5) — see PROGRESS.md.
 */
export async function requireEdit(): Promise<void> {
  const store = await cookies();
  if (store.get("edit")?.value !== "1") {
    throw new Error(
      "Editing is not enabled for this browser. Open the session with the edit link first.",
    );
  }
}

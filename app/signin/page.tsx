import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, Button } from "@/components/ui";
import { googleSignInConfigured } from "@/lib/authConfig";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { getSignedInSinger, getRole, ROLE_LABELS } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const singer = await getSignedInSinger();
  const role = await getRole();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <p className="mt-2 max-w-xl text-sm text-on-surface-muted">
          Signing in with Google identifies you by name, so your learning list is yours and
          the roster can show what you personally are singing.
        </p>
      </CardHeader>

      <CardContent className="grid gap-3">
        {!googleSignInConfigured ? (
          <p className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
            Google sign-in is not configured yet. Until then, access comes from the link the
            coordinator shares with you.
          </p>
        ) : singer ? (
          <>
            <p className="text-sm">
              Signed in as <strong>{singer.name}</strong> ({singer.email}) —{" "}
              {ROLE_LABELS[singer.role]}.
            </p>
            <form
              action={async () => {
                "use server";
                const { signOut } = await import("@/lib/authConfig");
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit">Sign out</Button>
            </form>
          </>
        ) : (
          <>
            <GoogleSignIn />
            <p className="text-sm text-on-surface-muted">
              You are currently <strong>{ROLE_LABELS[role]}</strong>. Signing in with an
              address the coordinator has not added to a singer will not change that —
              being on the list is a deliberate act, not something signing in grants.
            </p>
          </>
        )}

        <Link href="/" className="text-sm text-brass-ink underline underline-offset-2">
          Back to the app
        </Link>
      </CardContent>
    </Card>
  );
}

import { Button } from "@/components/ui";
import { signIn, googleSignInConfigured } from "@/lib/authConfig";

/**
 * The Google sign-in button.
 *
 * This exists as one shared component because it previously did not, and the
 * two copies drifted in a way that broke sign-in completely in production:
 * the closed-testing wall in app/layout.tsx rendered a *link* to /signin, but
 * the wall wraps every page including /signin, so following it re-rendered the
 * identical wall. Clicking did nothing visible and the real button was
 * unreachable. A button that starts OAuth cannot be a link to a page that
 * might itself be gated.
 *
 * It is a Server Action form rather than an onClick handler so it works before
 * hydration and without client JavaScript.
 */
export function GoogleSignIn({
  redirectTo = "/",
  label = "Continue with Google",
}: {
  redirectTo?: string;
  label?: string;
}) {
  if (!googleSignInConfigured) {
    return (
      <p className="rounded-[10px] border border-warn/40 bg-warn/[0.08] px-3 py-2 text-sm">
        Google sign-in is not configured on this deployment yet.
      </p>
    );
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo });
      }}
    >
      <Button type="submit" variant="primary">
        {label}
      </Button>
    </form>
  );
}

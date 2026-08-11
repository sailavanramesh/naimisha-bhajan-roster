import { NextRequest, NextResponse } from "next/server";

/**
 * Access links.
 *
 * `?k=<key>` identifies which access level the visitor has, sets a `role`
 * cookie, and redirects to the same URL without the key so it does not sit in
 * the address bar or get shared by accident.
 *
 * This is the interim mechanism until Google sign-in lands (SPEC §9.5), at
 * which point the role comes from `Singer.role` instead and only `lib/auth.ts`
 * `getRole` changes. The capability checks are already independent of it.
 *
 * The middleware only SETS the cookie. It is not authorisation — every
 * mutating Server Action calls `requireCapability` itself.
 */

function stripParam(url: URL, param: string) {
  url.searchParams.delete(param);
  return url;
}

/** key env var -> role. Order matters only for readability. */
const KEY_ROLES: Array<[string, string]> = [
  ["EDIT_KEY", "editor"], // the original link, kept working
  ["EDITOR_KEY", "editor"],
  ["MEMBER_KEY", "member"],
];

/**
 * Server Components cannot read the pathname, and the root layout needs it to
 * avoid putting the closed-testing wall over the sign-in page. Passing it as a
 * request header is the supported way to get it there.
 */
function withPathname(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

/**
 * Send everyone to one address.
 *
 * Once a custom domain is bound, the azurewebsites.net name keeps working —
 * Azure never stops serving it — so old links, old bookmarks and old home
 * screen icons would quietly go on using it forever. Anything host-specific
 * then has to be kept working twice over: the Google OAuth redirect URI, the
 * cookie domain, the link previews.
 *
 * Set CANONICAL_HOST to the new domain and every other host 308s to it, path
 * and query intact. 308 rather than 302 so the method is preserved and the
 * browser is told it is permanent.
 *
 * Unset, this does nothing, which is why it can ship before the domain exists.
 * Localhost is never redirected — that would make development impossible.
 */
function canonicalRedirect(req: NextRequest): NextResponse | null {
  const canonical = process.env.CANONICAL_HOST?.trim();
  if (!canonical) return null;

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const bare = host.split(":")[0].toLowerCase();
  if (!bare || bare === canonical.toLowerCase()) return null;
  if (bare === "localhost" || bare === "127.0.0.1" || bare.endsWith(".local")) return null;

  const target = new URL(req.nextUrl.toString());
  target.host = canonical;
  target.protocol = "https:";
  target.port = "";
  return NextResponse.redirect(target, 308);
}

export function middleware(req: NextRequest) {
  const moved = canonicalRedirect(req);
  if (moved) return moved;

  const url = req.nextUrl;

  if (url.searchParams.get("logout") === "1") {
    const nextUrl = stripParam(new URL(url.toString()), "logout");
    const res = NextResponse.redirect(nextUrl);
    res.cookies.set("edit", "", { path: "/", maxAge: 0 });
    res.cookies.set("role", "", { path: "/", maxAge: 0 });
    return res;
  }

  const k = url.searchParams.get("k");
  if (!k) return withPathname(req);

  const match = KEY_ROLES.find(([envVar]) => {
    const expected = process.env[envVar];
    return expected && expected.length > 0 && k === expected;
  });
  if (!match) return withPathname(req);

  const [, role] = match;
  const nextUrl = stripParam(new URL(url.toString()), "k");
  const res = NextResponse.redirect(nextUrl);

  /*
   * `secure` only when the request actually is HTTPS. Hard-coding it meant a
   * phone on http:// over the LAN silently discarded the cookie, so access
   * never switched on and nothing said why.
   */
  const isHttps =
    url.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";

  const options = {
    path: "/",
    httpOnly: false,
    sameSite: "lax" as const,
    secure: isHttps,
    maxAge: 60 * 60 * 24 * 365,
  };

  res.cookies.set("role", role, options);
  // Kept so anything still reading `edit` keeps working during the transition.
  if (role === "editor" || role === "owner") res.cookies.set("edit", "1", options);
  else res.cookies.set("edit", "", { ...options, maxAge: 0 });

  return res;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

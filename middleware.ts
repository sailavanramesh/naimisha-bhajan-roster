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

export function middleware(req: NextRequest) {
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
  if (role === "editor") res.cookies.set("edit", "1", options);
  else res.cookies.set("edit", "", { ...options, maxAge: 0 });

  return res;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

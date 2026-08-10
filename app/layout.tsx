import "./globals.css";
import { Faustina, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { YantraFull } from "@/components/Yantra";
import Link from "next/link";
import { getRole, getSignedInSinger, ROLE_LABELS, requireSignIn } from "@/lib/auth";

/**
 * Three roles, deliberately paired (docs/SPEC.md §6).
 *
 * Faustina carries the transliterated Sanskrit — it has the diacritic coverage
 * and reads as belonging to the tradition rather than to a dashboard.
 */
const display = Faustina({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = {
  title: "Naimiṣa Bhajan Roster",
  description: "Bhajan suggestions, rostering and pitch for the Naimisha Sai Centre",
};

export const viewport = {
  themeColor: "#12141C",
  width: "device-width",
  initialScale: 1,
};

function SignInWall() {
  return (
    <div className="rounded-[14px] border border-card-edge bg-surface p-6 text-on-surface">
      <h2 className="font-display text-2xl font-semibold">Naimiṣa Bhajan Roster</h2>
      <p className="mt-2 max-w-lg text-sm text-on-surface-muted">
        This is in testing with a small group. Sign in with the Google account the
        coordinator added for you.
      </p>
      <p className="mt-4">
        <Link
          href="/signin"
          className="inline-flex h-11 items-center rounded-[10px] border border-brass-ink/80 bg-brass-ink px-4 text-sm font-semibold text-ivory"
        >
          Continue with Google
        </Link>
      </p>
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
  const signedIn = await getSignedInSinger();
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {/* Keyboard users land here first. The old build had no skip link. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-[12px] focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-surface"
        >
          Skip to content
        </a>

        <div className="flex min-h-screen">
          <Nav role={role} />

          <div className="flex-1">
            <div className="mx-auto max-w-6xl px-3 pb-16 pt-14 sm:px-6 sm:pt-8">
              <header className="no-print mb-6">
                <div className="flex items-center gap-4 border-b border-rule pb-4">
                  <YantraFull size={54} className="shrink-0 text-brass" />
                  <div>
                    <h1 className="font-display text-2xl font-semibold tracking-tight text-on-ground sm:text-3xl">
                      Naimiṣa Bhajan Roster
                    </h1>
                    <p className="mt-1 text-sm text-on-ground-muted">
                      Suggest a set, roster it fairly, remember the pitch.
                      <Link
                        href="/signin"
                        className="ml-2 rounded-full border border-rule px-2 py-0.5 text-[11px] hover:border-brass/50"
                      >
                        {signedIn ? `${signedIn.name} · ${ROLE_LABELS[role]}` : ROLE_LABELS[role]}
                      </Link>
                    </p>
                  </div>
                </div>
              </header>

              <main id="main">
                {/*
                  Closed testing: everything is behind sign-in. Enforced in the
                  layout so it covers every page at once — a per-page check
                  would eventually miss one.
                */}
                {requireSignIn && role === "viewer" ? <SignInWall /> : children}
              </main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

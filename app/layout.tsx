import "./globals.css";
import { Faustina, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { YantraFull } from "@/components/Yantra";
import { getRole, ROLE_LABELS } from "@/lib/auth";

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();
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
                      <span className="ml-2 rounded-full border border-rule px-2 py-0.5 text-[11px]">
                        {ROLE_LABELS[role]}
                      </span>
                    </p>
                  </div>
                </div>
              </header>

              <main id="main">{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

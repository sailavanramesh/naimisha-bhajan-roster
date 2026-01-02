import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata = {
  title: "Naimisha Bhajan Roster",
  description: "Bhajan roster + masterlist",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-900">
        <div className="min-h-screen flex">
          <Nav />

          <div className="flex-1">
            <div className="mx-auto max-w-6xl px-3 pb-12 pt-14 sm:px-6 sm:pt-8">
              {/* small header (keeps things tidy; nav moved to sidebar) */}
              <header className="mb-5">
                <div className="rounded-[28px] border border-slate-200 bg-white/70 backdrop-blur px-4 py-3 sm:px-5 sm:py-4">
                  <div className="text-base sm:text-lg font-semibold">Naimisha Bhajan Roster</div>
                  <div className="text-xs sm:text-sm text-slate-600 mt-1">
                    Calendar + session editor + masterlist.
                  </div>
                </div>
              </header>

              <main>{children}</main>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

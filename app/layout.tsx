import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata = {
  title: "Naimisha Bhajan Roster",
  description: "Bhajan roster web app",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-5xl px-3 pb-12 pt-5 sm:px-5 sm:pt-7">
          <header className="mb-5 sm:mb-7">
            <div className="rounded-[28px] border border-slate-200 bg-white/65 backdrop-blur shadow-[0_12px_40px_rgba(15,23,42,0.08)] supports-[backdrop-filter]:bg-white/55">
              <div className="p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold tracking-tight sm:text-2xl">
                      Naimisha Bhajan Roster
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Quick edits • Mobile-first • Clean roster view
                    </div>
                  </div>

                  <div className="hidden sm:block text-right">
                    <div className="text-xs font-semibold text-slate-500">Tip</div>
                    <div className="mt-1 text-sm text-slate-700">
                      Use “Confirmed Pitch” as the main pitch field.
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <Nav />
                </div>
              </div>
            </div>
          </header>

          <main className="grid gap-4">{children}</main>

          <footer className="mt-10 text-center text-xs text-slate-500">
            Built for quick roster edits on the go.
          </footer>
        </div>
      </body>
    </html>
  );
}

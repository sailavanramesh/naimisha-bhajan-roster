"use client";

import Link from "next/link";
import { Yantra } from "@/components/Yantra";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

type NavItem = {
  href: string;
  label: string;
  short: string; // used when collapsed
};

const STORAGE_KEY = "naimisha_nav_expanded";

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", short: "D" },
  { href: "/build", label: "Build", short: "+" },
  { href: "/roster", label: "Roster", short: "R" },
  { href: "/program", label: "Programs", short: "♫" },
  { href: "/songs", label: "Songs", short: "♬" },
  { href: "/bhajans", label: "Bhajans", short: "B" },
  { href: "/explore", label: "Explore", short: "?" },
  { href: "/my-list", label: "My list", short: "♪" },
  { href: "/notifications", label: "Alerts", short: "!" },
  { href: "/singers", label: "Singers", short: "S" },
  { href: "/fairness", label: "Fairness", short: "≡" },
  { href: "/admin", label: "Admin", short: "⚙" },
  // Last, and visible to everybody: the page you send somebody who has just
  // been given the link. See app/guide/page.tsx.
  { href: "/guide", label: "Guide", short: "i" },
];

function Hamburger({ open }: { open: boolean }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-key border border-rule bg-ground-raised text-on-ground hover:bg-white/[0.08]">
      <span className="text-lg leading-none">{open ? "×" : "≡"}</span>
    </div>
  );
}

export function Nav({ role = "viewer", isDev = false }: { role?: string; isDev?: boolean }) {
  const pathname = usePathname();

  const [expanded, setExpanded] = useState<boolean>(true);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setExpanded(true);
      if (raw === "0") setExpanded(false);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, expanded ? "1" : "0");
    } catch {
      // ignore
    }
  }, [expanded]);

  const activeHref = useMemo(() => {
    // highlight parent section (e.g., /roster/[id])
    const exact = ITEMS.find((x) => x.href === pathname);
    if (exact) return exact.href;
    const parent = ITEMS.find((x) => x.href !== "/" && pathname?.startsWith(x.href));
    return parent?.href ?? "/";
  }, [pathname]);

  // Members and viewers see only the reading surface. The list is filtered on
  // the server, so a hidden page is not merely un-clicked — the page itself
  // also checks.
  const visible =
    role === "editor" || role === "owner"
      ? ITEMS
      : // No Dashboard for a member: it is a coordinator's overview — session
        // counts, fairness loads, what needs building — and none of it is a
        // member's to act on. They start at the roster.
        ITEMS.filter((i) =>
          ["/roster", "/bhajans", "/singers", "/explore", "/my-list", "/notifications", "/guide"].includes(
            i.href,
          ),
        );

  const NavLinks = ({ collapsed }: { collapsed: boolean }) => (
    <nav className="grid gap-1">
      {visible.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={clsx(
              "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
              active
                ? "bg-brass/15 text-on-ground ring-1 ring-brass/40"
                : "text-on-ground-muted hover:bg-panel-hover hover:text-on-ground"
            )}
            onClick={() => setMobileOpen(false)}
          >
            <div
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-semibold",
                active ? "border-brass/50 bg-brass/20 text-on-ground" : "border-rule bg-panel"
              )}
            >
              {item.short}
            </div>

            {!collapsed ? <div className="font-medium">{item.label}</div> : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "no-print hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:border-r lg:border-rule lg:bg-ground-raised lg:p-3",
          expanded ? "lg:w-64" : "lg:w-20"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-1 pb-3">
          <div className={clsx("flex items-center gap-2 font-display text-sm font-semibold text-on-ground", expanded ? "opacity-100" : "opacity-0 pointer-events-none")}>
            <Yantra size={22} className="text-brass" variant={isDev ? "dev" : "brand"} />
            Naimiṣa Roster
          </div>

          <button
            type="button"
            className="shrink-0"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          >
            <Hamburger open={expanded} />
          </button>
        </div>

        <NavLinks collapsed={!expanded} />

        {/*
          The "use the editable link to enable editing" tip is gone. It dated
          from before Google sign-in, when access came from a shared link and
          people genuinely had to be told; now everybody signs in and their
          role arrives with them, so it was advice about a mechanism that no
          longer applies, taking a line of every page to give it.
        */}
      </aside>

      {/* Mobile top-left trigger */}
      <div className="no-print lg:hidden fixed left-3 top-3 z-[60]">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
          <Hamburger open={false} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        // Above every sticky cell (10-20), below the live view (100) — see the
        // layering note in app/globals.css.
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-[320px] bg-ground-raised border-r border-rule p-3">
            <div className="flex items-center justify-between px-1 pb-3">
              <div className="flex items-center gap-2 font-display text-sm font-semibold text-on-ground"><Yantra size={22} className="text-brass" variant={isDev ? "dev" : "brand"} />Naimiṣa Roster</div>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                <Hamburger open={true} />
              </button>
            </div>

            <NavLinks collapsed={false} />
          </div>
        </div>
      ) : null}
    </>
  );
}

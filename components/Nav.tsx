"use client";

import Link from "next/link";
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
  { href: "/", label: "Dashboard", short: "D" },
  { href: "/roster", label: "Roster", short: "R" },
  { href: "/bhajans", label: "Bhajans", short: "B" },
  { href: "/singers", label: "Singers", short: "S" },
  { href: "/instruments", label: "Instruments", short: "I" },
  { href: "/festival", label: "Festival", short: "F" },
];

function Hamburger({ open }: { open: boolean }) {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white hover:bg-gray-50">
      <span className="text-lg leading-none">{open ? "×" : "≡"}</span>
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();

  const [expanded, setExpanded] = useState<boolean>(false);
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

  const NavLinks = ({ collapsed }: { collapsed: boolean }) => (
    <nav className="grid gap-1">
      {ITEMS.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={clsx(
              "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
              active ? "bg-slate-900 text-white" : "text-slate-800 hover:bg-slate-100"
            )}
            onClick={() => setMobileOpen(false)}
          >
            <div
              className={clsx(
                "flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-semibold",
                active ? "border-white/20 bg-white/10" : "border-slate-200 bg-white"
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
          "hidden md:flex md:sticky md:top-0 md:h-screen md:flex-col md:border-r md:bg-white md:p-3",
          expanded ? "md:w-64" : "md:w-20"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-1 pb-3">
          <div className={clsx("text-sm font-semibold", expanded ? "opacity-100" : "opacity-0 pointer-events-none")}>
            Naimisha Roster
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

        <div className={clsx("mt-auto pt-3 text-xs text-gray-500", expanded ? "opacity-100" : "opacity-0")}>
          Tip: use the editable link to enable editing.
        </div>
      </aside>

      {/* Mobile top-left trigger */}
      <div className="md:hidden fixed left-3 top-3 z-50">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
          <Hamburger open={false} />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[82%] max-w-[320px] bg-white border-r p-3">
            <div className="flex items-center justify-between px-1 pb-3">
              <div className="text-sm font-semibold">Naimisha Roster</div>
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

"use client";

import Link from "next/link";
import { Yantra } from "@/components/Yantra";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import {
  activeHrefIn,
  groupContaining,
  isNavGroup,
  navFor,
  navLeaves,
  type NavLeaf,
} from "@/lib/nav";

const STORAGE_KEY = "naimisha_nav_expanded";
const OPEN_GROUPS_KEY = "naimisha_nav_groups";

/*
 * The menu itself — which pages, in what order, and which of them are folded
 * away — lives in lib/nav.ts. It is policy about who sees what, and this file
 * is the presentation of it.
 */

function Hamburger({ open }: { open: boolean }) {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-key border border-rule bg-ground-raised text-on-ground hover:bg-white/[0.08]">
      <span className="text-lg leading-none">{open ? "×" : "≡"}</span>
    </div>
  );
}

/** The icon box every row carries, so a fold heading lines up with a link. */
function Glyph({ short, active }: { short: string; active: boolean }) {
  return (
    <div
      className={clsx(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold",
        active ? "border-brass/50 bg-brass/20 text-on-ground" : "border-rule bg-panel"
      )}
    >
      {short}
    </div>
  );
}

const ROW = "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm";
const ROW_IDLE = "text-on-ground-muted hover:bg-panel-hover hover:text-on-ground";
const ROW_ACTIVE = "bg-brass/15 text-on-ground ring-1 ring-brass/40";

export function Nav({ role = "viewer", isDev = false }: { role?: string; isDev?: boolean }) {
  const pathname = usePathname();

  const [expanded, setExpanded] = useState<boolean>(true);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setExpanded(true);
      if (raw === "0") setExpanded(false);
      const groups = localStorage.getItem(OPEN_GROUPS_KEY);
      if (groups) {
        const parsed: unknown = JSON.parse(groups);
        if (Array.isArray(parsed)) setOpenGroups(parsed.filter((g): g is string => typeof g === "string"));
      }
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

  /*
   * Members and viewers see only the reading surface. The list is filtered on
   * the server, so a hidden page is not merely un-clicked — the page itself
   * also checks. See lib/nav.ts for what is in that surface and why.
   */
  const tree = useMemo(() => navFor(role), [role]);
  const activeHref = useMemo(() => activeHrefIn(tree, pathname), [tree, pathname]);
  /* Arriving inside a fold opens it. Nobody should have to find the page they
     are already looking at. */
  const activeGroup = useMemo(() => groupContaining(tree, activeHref), [tree, activeHref]);

  /* What the mobile bar calls the page you are on. */
  const here = useMemo(
    () => navLeaves(tree).find((l) => l.href === activeHref)?.label ?? null,
    [tree, activeHref],
  );

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => {
      const next = prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label];
      try {
        localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

  const LinkRow = ({
    leaf,
    collapsed,
    nested = false,
  }: {
    leaf: NavLeaf;
    collapsed: boolean;
    nested?: boolean;
  }) => {
    const active = leaf.href === activeHref;
    return (
      <Link
        href={leaf.href}
        title={collapsed ? leaf.label : undefined}
        className={clsx(ROW, active ? ROW_ACTIVE : ROW_IDLE, nested && "ps-2")}
        onClick={() => setMobileOpen(false)}
      >
        <Glyph short={leaf.short} active={active} />
        {!collapsed ? <div className="min-w-0 truncate font-medium">{leaf.label}</div> : null}
      </Link>
    );
  };

  const NavLinks = ({ collapsed }: { collapsed: boolean }) => {
    /*
     * A rail has no room for a heading, and a fold you cannot read the name of
     * is a fold you will not open. So when the sidebar is collapsed to icons,
     * the groups are flattened and every page is one click away as before.
     */
    if (collapsed) {
      return (
        <nav className="grid gap-1">
          {navLeaves(tree).map((leaf) => (
            <LinkRow key={leaf.href} leaf={leaf} collapsed />
          ))}
        </nav>
      );
    }

    return (
      <nav className="grid gap-1">
        {tree.map((entry) => {
          if (!isNavGroup(entry)) {
            return <LinkRow key={entry.href} leaf={entry} collapsed={false} />;
          }

          const open = openGroups.includes(entry.label) || activeGroup === entry.label;
          const holdsActive = activeGroup === entry.label;
          const id = `nav-group-${entry.label.replace(/[^a-z]+/gi, "-").toLowerCase()}`;

          return (
            <div key={entry.label} className="grid gap-1">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => toggleGroup(entry.label)}
                className={clsx(ROW, "w-full text-left", ROW_IDLE, holdsActive && "text-on-ground")}
              >
                <Glyph short={entry.short} active={false} />
                <div className="min-w-0 flex-1 truncate font-medium">{entry.label}</div>
                <span aria-hidden className={clsx("text-[10px] transition", open && "rotate-90")}>
                  ▶
                </span>
              </button>

              {open ? (
                /* Indented against a rule, so a child reads as being under the
                   heading rather than as another top-level page. */
                <div id={id} className="ms-4 grid gap-1 border-s border-rule ps-2">
                  {entry.children.map((leaf) => (
                    <LinkRow key={leaf.href} leaf={leaf} collapsed={false} nested />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "no-print hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:flex-col lg:overflow-y-auto lg:border-r lg:border-rule lg:bg-ground-raised lg:p-3",
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

      {/*
        Mobile top bar.

        It was a bare floating button at left-3 top-3, and being both fixed and
        transparent it sat ON the first thing on the page — over the "1" of the
        first song in a running order, over the VERSE 6 chip on a song, over the
        words "Running order" on a phone held sideways, which is where the top
        padding drops to 8. All four of Sailavan's screenshots on 2026-08-21
        caught it doing that.

        An opaque full-width bar of the same height as the padding the layout
        already reserves covers nothing: the page scrolls behind it and stays
        readable, which is what every app on the phone does. The current page is
        named in it because an empty strip with one button reads as a mistake.
      */}
      <div className="no-print fixed inset-x-0 top-0 z-[60] flex h-14 items-center gap-3 border-b border-rule bg-ground/95 px-3 backdrop-blur lg:hidden">
        <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
          <Hamburger open={false} />
        </button>
        <span className="min-w-0 truncate font-display text-sm font-semibold text-on-ground">
          {here ?? "Naimiṣa Roster"}
        </span>
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        // Above every sticky cell (10-20), below the live view (100) — see the
        // layering note in app/globals.css.
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-[82%] max-w-[320px] flex-col overflow-y-auto border-r border-rule bg-ground-raised p-3">
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

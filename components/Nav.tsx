"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/roster", label: "Roster" },
  { href: "/bhajans", label: "Bhajans" },
  { href: "/singers", label: "Singers" },
  { href: "/instruments", label: "Instruments" },
  { href: "/festival", label: "Festival" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Nav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-30 -mx-3 px-3 sm:static sm:mx-0 sm:px-0">
      <div className="rounded-[26px] border border-slate-200 bg-white/70 backdrop-blur shadow-[0_10px_30px_rgba(15,23,42,0.06)] supports-[backdrop-filter]:bg-white/55">
        <div className="flex gap-2 overflow-x-auto px-2 py-2 sm:flex-wrap sm:overflow-visible">
          {links.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={[
                  "whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-semibold transition",
                  "border border-slate-200",
                  active
                    ? "text-white border-transparent bg-gradient-to-r from-indigo-600 to-violet-600 shadow-[0_10px_24px_rgba(79,70,229,0.22)]"
                    : "bg-white/80 text-slate-700 hover:bg-white",
                ].join(" ")}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

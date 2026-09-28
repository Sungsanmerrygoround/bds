"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "추이" },
  { href: "/events", label: "신고가·하락" },
  { href: "/complex", label: "단지" },
  { href: "/supply", label: "입주 물량" },
] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center rounded px-3.5 ${active ? "bg-raised font-semibold text-ink" : "text-ink-2 hover:bg-wash"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

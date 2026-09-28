"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "추이" },
  { href: "/compare", label: "지역 비교" },
  { href: "/events", label: "신고가·하락" },
  { href: "/complex", label: "단지" },
  { href: "/supply", label: "입주 물량" },
] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="주요 화면" className="-mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-2 text-sm sm:mx-0 sm:w-auto sm:px-0">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 sm:rounded sm:px-3.5 ${active ? "font-semibold text-ink shadow-[inset_0_-2px_0_var(--series-1)] sm:bg-raised sm:shadow-none" : "text-ink-2 hover:bg-wash"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

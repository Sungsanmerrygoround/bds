import Link from "next/link";

// 신고가·하락 화면과 해제된 거래 화면을 오가는 탭 (상단 메뉴에서는 둘 다 '신고가·하락')

const TABS = [
  { href: "/events", label: "신고가·하락" },
  { href: "/events/cancelled", label: "해제된 거래" },
] as const;

export function EventTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="거래 목록 종류" className="mb-3 flex gap-1 text-sm">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`flex min-h-10 items-center rounded border px-3 ${t.href === active ? "border-s1 bg-surface-2 font-semibold text-ink" : "border-line text-ink-2 hover:bg-wash"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

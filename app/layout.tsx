import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { NavLinks } from "./_components/NavLinks";
import { GradientDefs } from "./_components/ui";
import { getIngestStatus, getTicker, type TickerRow } from "@/lib/queries";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "BDS 실거래 대시보드",
  description: "관심 지역 아파트 매매·전세 추이, 신고가·하락 거래, 입주 물량",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ finishedAt, stale }, ticker] = await Promise.all([getIngestStatus(), getTicker().catch(() => [])]);
  const lastText = finishedAt ? kstShort(finishedAt) : "기록 없음";

  return (
    <html lang="ko" className={`${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <GradientDefs />
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-7 px-4 sm:min-h-[60px] sm:flex-nowrap sm:px-6">
            <Link href="/" className="mono flex min-h-[52px] items-center gap-2.5 text-base font-semibold tracking-wider">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-s1" />
              BDS
            </Link>
            <div className={`mono ml-auto flex items-center gap-2 text-xs sm:order-2 ${stale ? "text-warn" : "text-ink-2"}`}>
              {stale ? (
                <svg width="14" height="14" aria-hidden="true"><path d="M7 2 L12.5 12 H1.5 Z M7 6 V8.5 M7 10.2 V10.4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              ) : (
                <svg width="14" height="14" aria-hidden="true"><path d="M3 7.5 L6 10.5 L11 4.5" fill="none" stroke="var(--ok)" strokeWidth="2" /></svg>
              )}
              <span className="hidden sm:inline">{stale ? "수집 지연" : "수집 정상"} ·</span>
              {stale && <span className="sm:hidden">지연</span>}
              {lastText}
              <span className="hidden sm:inline">KST</span>
            </div>
            <div className="order-last w-full border-t border-line sm:order-1 sm:w-auto sm:min-w-0 sm:flex-1 sm:border-0">
              <NavLinks />
            </div>
          </div>
        </header>
        {ticker.length > 0 && <Ticker rows={ticker} />}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">{children}</main>
        <footer className="mx-auto w-full max-w-[1400px] px-4 pb-6 text-xs text-muted sm:px-6">
          출처: 국토교통부 실거래가 공개시스템, 한국부동산원 청약홈. 전용 55㎡ 미만 제외, 가격은 해제·정정 거래를 뺀 값.
        </footer>
      </body>
    </html>
  );
}

/** '2026-09-28T10:16:54Z' → '09.28 19:16' (KST) */
function kstShort(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString();
  return `${d.slice(5, 7)}.${d.slice(8, 10)} ${d.slice(11, 16)}`;
}

function Ticker({ rows }: { rows: TickerRow[] }) {
  return (
    <div className="border-b border-line">
      <div className="mx-auto flex h-11 max-w-[1400px] items-center gap-6 overflow-x-auto whitespace-nowrap px-4 sm:px-6">
        <Link href="/events?type=NEW_HIGH&n=3" className="cap shrink-0 !text-up hover:underline">▲ 최근 신고가</Link>
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/complex/${encodeURIComponent(r.apt_seq)}?area=${r.area_type}`}
            className="flex shrink-0 items-baseline gap-2 text-[13px] hover:underline"
          >
            <span className="text-ink">{r.complexes.apt_nm}</span>
            <span className="mono text-muted">{r.area_type}㎡</span>
            <span className="mono text-ink">{(r.price_man / 10000).toFixed(2)}억</span>
            <span className="mono text-up">+{Number(r.change_pct).toFixed(1)}%</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

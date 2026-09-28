import type { Metadata } from "next";
import { NavLinks } from "./_components/NavLinks";
import { getLastIngest } from "@/lib/queries";
import "./globals.css";

export const metadata: Metadata = {
  title: "BDS 실거래 대시보드",
  description: "관심 지역 아파트 매매·전세 추이, 신고가·하락 거래, 입주 물량",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const last = await getLastIngest().catch(() => null);
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <span className="font-semibold">BDS</span>
            <NavLinks />
            {last && (
              <span className="ml-auto text-xs text-muted">
                마지막 수집 {new Date(last.finished_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}
              </span>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-muted">
          출처: 국토교통부 실거래가 공개시스템, 한국부동산원 청약홈. 전용 55㎡ 미만 제외, 금액은 해제·정정 거래를 뺀 값.
        </footer>
      </body>
    </html>
  );
}

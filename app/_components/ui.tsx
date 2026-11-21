import Link from "next/link";
import type { ReactNode } from "react";
import { FavButton } from "./FavButton";
import { barPath, seriesPaths } from "@/lib/chart";
import { formatYm } from "@/lib/format";

/**
 * 목록 표의 단지 이름: 단지 화면(area가 있으면 그 전용면적)으로 가는 링크 + 흐린 부가 설명(위치 등).
 * fav를 주면 앞에 관심 단지 ★ 버튼을 붙인다 (true = 이미 관심 단지).
 */
export function ComplexLink({ aptSeq, name, where, area, fav }: { aptSeq: string; name: string; where?: string; area?: number | null; fav?: boolean }) {
  const link = (
    <>
      <Link href={`/complex/${encodeURIComponent(aptSeq)}${area == null ? "" : `?area=${area}`}`} className="font-medium hover:underline">{name}</Link>
      {where != null && <span className="ml-1.5 text-xs text-muted">{where}</span>}
    </>
  );
  if (fav == null) return link;
  return (
    <span className="flex items-center gap-1">
      <FavButton aptSeq={aptSeq} on={fav} name={name} />
      <span className="min-w-0">{link}</span>
    </span>
  );
}

/** 목록 화면 제목과 설명 (추이·비교처럼 필터 레일이 있는 화면은 제목을 숨기고 쓰지 않는다) */
export function PageHeader({ title, children, gap = "mb-4" }: { title: string; children: ReactNode; gap?: "mb-3" | "mb-4" }) {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">{title}</h1>
      <p className={`${gap} text-sm text-ink-2`}>{children}</p>
    </>
  );
}

/** 표에 보여 줄 행이 없을 때의 안내 한 줄 (className: 위아래 여백 등) */
export function EmptyRow({ cols, children, className = "py-12" }: { cols: number; children: ReactNode; className?: string }) {
  return <tr><td colSpan={cols} className={`${className} text-center text-muted`}>{children}</td></tr>;
}

/** 월별 표의 첫 칸: 2026.09 + 신고 기한 안이라 집계 중이면 표시 */
export function MonthLabel({ ym, partial }: { ym: string; partial: boolean }) {
  return <>{formatYm(ym)}{partial && <span className="ml-1.5 text-s2">집계 중</span>}</>;
}

/** 목록 쪽 넘김: hrefOf(i)는 i번째(0부터) 쪽 주소. 한 쪽뿐이면 그리지 않는다 */
export function Pager({ page, pages, hrefOf }: { page: number; pages: number; hrefOf: (i: number) => string }) {
  if (pages <= 1) return null;
  const btn = "flex min-h-10 items-center rounded border border-line px-3 text-sm";
  return (
    <nav aria-label="쪽 넘김" className="mt-3 flex items-center justify-center gap-2">
      {page > 0 ? <Link href={hrefOf(page - 1)} className={`${btn} text-ink-2 hover:bg-wash`}>← 이전</Link> : <span className={`${btn} text-muted opacity-50`}>← 이전</span>}
      <span className="mono px-2 text-sm text-ink-2">{page + 1} / {pages}</span>
      {page < pages - 1 ? <Link href={hrefOf(page + 1)} className={`${btn} text-ink-2 hover:bg-wash`}>다음 →</Link> : <span className={`${btn} text-muted opacity-50`}>다음 →</span>}
    </nav>
  );
}

/** 차트 아래 접어 둔 표 */
export function TableDetails({ summary = "표로 보기", children }: { summary?: string; children: ReactNode }) {
  return (
    <details className="panel px-4 py-3 text-sm">
      <summary className="flex min-h-8 cursor-pointer items-center text-ink-2">{summary}</summary>
      <div className="overflow-x-auto">{children}</div>
    </details>
  );
}

export function Card({ title, subtitle, right, children }: { title: ReactNode; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel mb-4 px-4 pb-3 pt-3.5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** 변동 방향(deltaTone) → 글자색 */
export const toneText = { up: "text-up", down: "text-down", muted: "text-muted" } as const;

export function Stat({ label, value, unit, sub, subTone, children }: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  subTone?: "up" | "down" | "muted";
  children?: ReactNode;
}) {
  return (
    <div className="panel flex min-w-0 flex-col gap-1 px-4 pb-3 pt-3.5">
      <div className="cap truncate">{label}</div>
      <div className="mono text-[28px] font-semibold leading-tight">
        {value}
        {unit && <span className="text-[15px] text-ink-2">{unit}</span>}
      </div>
      {sub && <div className={`mono text-xs ${toneText[subTone ?? "muted"]}`}>{sub}</div>}
      {children && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "up" | "down" | "warn" | "neutral" }) {
  const cls = { up: "text-up border-up/40", down: "text-down border-down/40", warn: "text-warn border-warn/40", neutral: "text-ink-2 border-line" }[tone];
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 font-sans text-xs ${cls}`}>{children}</span>;
}

/** 지표 카드용 스파크라인 (서버에서 SVG로 그림). 마지막 partial개는 점선. */
export function Spark({ values, color, gradient, partial = 0 }: {
  values: (number | null)[];
  color: string;
  gradient: string;
  partial?: number;
}) {
  const w = 200, h = 34;
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return <div style={{ height: h }} />;
  const lo = Math.min(...nums), hi = Math.max(...nums), pad = (hi - lo) * 0.12 || 1;
  const x = (i: number) => 3 + ((w - 6) * i) / (values.length - 1);
  const y = (v: number) => 4 + (h - 8) * (1 - (v - lo + pad) / (hi - lo + pad * 2));
  const p = seriesPaths(values, x, y, h, values.length - partial);
  // 가로로 늘어나도(preserveAspectRatio=none) 선 굵기는 유지된다. 원은 찌그러지므로 쓰지 않는다.
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" className="block overflow-visible">
      <path d={p.area} fill={`url(#${gradient})`} />
      <path d={p.solid} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path d={p.dashed} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 거래 건수 미니 막대 */
export function SparkBars({ values, color }: { values: number[]; color: string }) {
  const w = 200, h = 34, max = Math.max(1, ...values), slot = w / values.length;
  const d = values.map((v, i) => barPath(i * slot + 2, slot - 4, h - (h - 4) * (v / max), h, 1.5)).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true" className="block">
      <path d={d} fill={color} fillOpacity={0.5} />
    </svg>
  );
}

/** 페이지 어디서든 url(#grad-s1) 등으로 쓰는 세로 그라데이션 */
export function GradientDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        {(["s1", "s2", "s3"] as const).map((k, i) => (
          <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className={`stop-${k}`} stopOpacity={[0.3, 0.2, 0.28][i]} />
            <stop offset="1" className={`stop-${k}`} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

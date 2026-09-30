import type { ReactNode } from "react";
import { barPath, seriesPaths } from "@/lib/chart";

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

export function Stat({ label, value, unit, sub, subTone, children }: {
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  subTone?: "up" | "down" | "muted";
  children?: ReactNode;
}) {
  const tone = subTone === "up" ? "text-up" : subTone === "down" ? "text-down" : "text-muted";
  return (
    <div className="panel flex min-w-0 flex-col gap-1 px-4 pb-3 pt-3.5">
      <div className="cap truncate">{label}</div>
      <div className="mono text-[28px] font-semibold leading-tight">
        {value}
        {unit && <span className="text-[15px] text-ink-2">{unit}</span>}
      </div>
      {sub && <div className={`mono text-xs ${tone}`}>{sub}</div>}
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

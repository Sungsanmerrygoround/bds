"use client";

import { useState, type ReactNode } from "react";
import { niceTicks, seriesPaths, spreadLabels } from "@/lib/chart";
import { longYm } from "@/lib/format";
import { axisLayout, chartPad, chartPanel, fx, pointerSelect, Swatch, Tag, timeScale, useWidth, XAxis, YearMarks, YLabel } from "./chartKit";

// 월별 지표 선 차트 (전세 갱신 등). 같은 단위의 계열만 한 차트에 — 단위가 다르면 차트를 나눈다.

export interface MetricSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
}

const XH = 26;

// 서버 컴포넌트에서 함수를 넘길 수 없어 형식은 이름으로 받는다
const FORMATS = {
  pct: (v: number) => `${v.toFixed(0)}%`,
  signedPct: (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`,
} as const;
export type MetricFormat = keyof typeof FORMATS;

export function MetricChart({ title, unit, note, months, partialFrom, series, format, height = 220, zero = false, children }: {
  title: string;
  unit: string;
  note?: ReactNode;
  months: string[];
  partialFrom: number; // 이 인덱스부터 집계 중(점선)
  series: MetricSeries[];
  format: MetricFormat;
  height?: number;
  zero?: boolean; // 0 기준선 (변동률)
  children?: ReactNode; // 차트 아래 부가 설명
}) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const fmt = FORMATS[format];
  const n = months.length;
  const lastDone = Math.max(0, Math.min(partialFrom, n) - 1);
  const h = hover ?? lastDone;

  const layout = axisLayout(w);
  const { L0, R0, font } = layout;
  const ts = timeScale(months, w, L0, R0);
  const pointer = pointerSelect(setHover, L0, ts.slot, n);
  const T = 22, B = 6;

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const lo = Math.min(...all, ...(zero ? [0] : [])), hi = Math.max(...all, ...(zero ? [0] : []));
  const ticks = all.length ? niceTicks(lo, hi, 5) : [0, 1];
  const y = (v: number) => T + (height - T - B) * (1 - (v - ticks[0]) / (ticks[ticks.length - 1] - ticks[0]));
  const hx = ts.X(h);

  // 오른쪽 태그: 계열별 집계 끝난 최근 값
  const tags = series
    .map((s) => {
      const i = s.values.slice(0, lastDone + 1).findLastIndex((v) => v != null);
      return i < 0 ? null : { s, v: s.values[i]! };
    })
    .filter((t): t is { s: MetricSeries; v: number } => t != null);
  const tagYs = spreadLabels(tags.map((t) => y(t.v)), font + 11, 10, height - 10);
  const tickShown = (v: number) => layout.compact || tagYs.every((ty) => Math.abs(ty - y(v)) >= 14);

  return (
    <section className={chartPanel}>
      <div className={`${chartPad} flex flex-wrap items-center justify-between gap-2`}>
        <h2 className="text-sm font-semibold">
          {title} <span className="mono text-xs font-normal text-muted">{unit}</span>
        </h2>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      <div className={`${chartPad} mono flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2`}>
        <span className="font-semibold text-ink">
          {longYm(months[h])}
          {h >= partialFrom && <span className="ml-2 font-normal text-s2">집계 중</span>}
        </span>
        {series.map((s) => <Swatch key={s.key} color={s.color} label={s.label} value={s.values[h] == null ? "-" : fmt(s.values[h]!)} />)}
      </div>
      <div ref={ref} className="w-full select-none" style={{ minHeight: height + XH }}>
        {w > 0 && all.length > 0 && (
          <>
            <svg width={w} height={height} className="block" role="img" aria-label={`${title} 월별 차트`} {...pointer}>
              {ticks.map((v) => <path key={v} d={`M${L0} ${fx(y(v))} H${w - R0}`} stroke="var(--grid)" strokeDasharray="2 4" />)}
              {zero && ticks[0] < 0 && <path d={`M${L0} ${fx(y(0))} H${w - R0}`} stroke="var(--muted)" strokeDasharray="4 3" />}
              <YearMarks ts={ts} height={height} />
              {series.map((s) => {
                const p = seriesPaths(s.values, ts.X, y, height - B, partialFrom);
                return (
                  <g key={s.key}>
                    <path d={p.solid} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    <path d={p.dashed} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="3 4" strokeLinecap="round" />
                  </g>
                );
              })}
              <path d={`M${fx(hx)} 0 V${height}`} stroke="#6b7280" />
              {series.map((s) => (s.values[h] == null ? null : (
                <circle key={s.key} cx={hx} cy={y(s.values[h]!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2.5} />
              )))}
              {ticks.slice(layout.compact ? 1 : 0).filter(tickShown).map((v) => <YLabel key={v} y={y(v)} text={fmt(v)} w={w} layout={layout} />)}
              {tags.map((t, k) => <Tag key={t.s.key} x={w - R0 + 4} y={tagYs[k]} text={fmt(t.v)} bg={t.s.color} fg="var(--page)" font={font} />)}
            </svg>
            <XAxis ts={ts} w={w} h={h} months={months} layout={layout} height={XH} />
          </>
        )}
        {all.length === 0 && <p className="py-12 text-center text-sm text-muted">표시할 값이 없습니다.</p>}
      </div>
      {children && <div className={`${chartPad} text-xs text-muted`}>{children}</div>}
    </section>
  );
}

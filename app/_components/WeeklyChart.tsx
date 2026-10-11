"use client";

import { useState, type ReactNode } from "react";
import { changePct, linearY, niceTicks, seriesPaths, weekScale } from "@/lib/chart";
import { signedPct } from "@/lib/format";
import {
  AxisTags, axisLayout, chartPad, chartPanel, ChartTitle, Crosshair, GridLines, HoverDot, pointerSelect, readoutRow,
  Swatch, Tag, useWidth, YearMarks,
} from "./chartKit";

// 주간 지수 선 차트 (부동산원). 주간 지수는 발표되면 확정이라 "집계 중" 점선이 없다.
// dashed는 같은 지역 그룹의 두 번째 구(구성남 중원구)를 같은 색 점선으로 구분할 때 쓴다.

export interface WeeklySeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
  values: (number | null)[];
}

const XH = 26;
const T = 22, B = 6; // 위·아래 여백
const fmt = (v: number) => v.toFixed(1);
const longWeek = (d: string) => `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일 주`;

export function WeeklyChart({ title, unit, note, weeks, series, height = 200, children }: {
  title: string;
  unit: string;
  note?: ReactNode;
  weeks: string[]; // 월요일 날짜 오름차순
  series: WeeklySeries[];
  height?: number;
  children?: ReactNode;
}) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const n = weeks.length;
  const h = hover ?? n - 1;

  const layout = axisLayout(w);
  const { L0, R0, font } = layout;
  const ts = weekScale(weeks, w, L0, R0);
  const pointer = pointerSelect(setHover, L0, ts.slot, n);

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const ticks = all.length ? niceTicks(Math.min(...all), Math.max(...all), 5) : [0, 1];
  const y = linearY(ticks, T, height, B);
  const hx = ts.X(h);

  // 오른쪽 태그: 계열별 최근 값
  const tags = series
    .map((s) => {
      const i = s.values.findLastIndex((v) => v != null);
      return i < 0 ? null : { key: s.key, value: s.values[i]!, color: s.color };
    })
    .filter((t) => t != null);

  return (
    <section className={chartPanel}>
      <ChartTitle title={title} unit={unit} right={note && <span className="text-[11px] text-muted">{note}</span>} />
      <div className={`${chartPad} ${readoutRow}`}>
        <span className="font-semibold text-ink">{n ? longWeek(weeks[h]) : "-"}</span>
        {series.map((s) => {
          const v = s.values[h];
          const c = changePct(s.values, h);
          return (
            <Swatch key={s.key} color={s.color} label={s.label}
              value={v == null ? "-" : `${fmt(v)}${c == null ? "" : ` (${signedPct(c, 2)})`}`} />
          );
        })}
      </div>
      <div ref={ref} className="w-full select-none" style={{ minHeight: height + XH }}>
        {w > 0 && all.length > 0 && (
          <>
            <svg width={w} height={height} className="block" role="img" aria-label={`${title} 주간 차트`} {...pointer}>
              <GridLines ticks={ticks} y={y} x0={L0} x1={w - R0} />
              <YearMarks ts={ts} height={height} />
              {series.map((s) => (
                <path key={s.key} d={seriesPaths(s.values, ts.X, y, height - B, n).solid} fill="none" stroke={s.color} strokeWidth={2}
                  strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
              ))}
              <Crosshair x={hx} height={height} />
              {series.map((s) => (s.values[h] == null ? null : <HoverDot key={s.key} x={hx} y={y(s.values[h]!)} color={s.color} />))}
              <AxisTags items={tags} y={y} height={height} ticks={ticks} fmtTick={fmt} fmtTag={fmt} w={w} layout={layout} />
            </svg>
            <svg width={w} height={XH} className="block" aria-hidden="true">
              {ts.xTicks.map((t) => (
                <text key={t.i} x={ts.X(t.i)} y={16} textAnchor="middle" className="mono" fontSize={font} fill="var(--muted)">{t.label}</text>
              ))}
              <Tag x={Math.min(Math.max(hx - 27, 0), w - 54)} y={12} text={`${weeks[h].slice(5, 7)}.${weeks[h].slice(8)}`} bg="var(--tag)" fg="var(--ink)" font={font} />
            </svg>
          </>
        )}
        {all.length === 0 && <p className="py-12 text-center text-sm text-muted">표시할 값이 없습니다.</p>}
      </div>
      {children && <div className={`${chartPad} text-xs text-muted`}>{children}</div>}
    </section>
  );
}

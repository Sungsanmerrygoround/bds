"use client";

import { useState, type ReactNode } from "react";
import { linearY, niceTicks, timeScale } from "@/lib/chart";
import { longYm, shortYm, signedPct } from "@/lib/format";
import {
  AxisTags, axisLayout, chartPad, chartPanel, ChartTitle, Crosshair, fx, GridLines, HoverDot, lastTags, pointerSelect, readoutRow,
  SeriesLine, Swatch, useWidth, XAxis, YearMarks,
} from "./chartKit";

// 월별 지표 선 차트 (전세 갱신 등). 같은 단위의 계열만 한 차트에 — 단위가 다르면 차트를 나눈다.

export interface MetricSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
}

const XH = 26;
const T = 22, B = 6; // 위·아래 여백

// 서버 컴포넌트에서 함수를 넘길 수 없어 형식은 이름으로 받는다
const FORMATS = {
  pct: (v: number) => `${v.toFixed(0)}%`,
  signedPct: (v: number) => signedPct(v),
  rate: (v: number) => `${v.toFixed(2)}%`,
} as const;
export type MetricFormat = keyof typeof FORMATS;

export function MetricChart({ title, unit, note, months, partialFrom, partialLabel = "집계 중", focus, series, format, height = 220, zero = false, children }: {
  title: string;
  unit: string;
  note?: ReactNode;
  months: string[];
  partialFrom: number; // 이 인덱스부터 집계 중(점선)
  partialLabel?: string; // partialFrom 이후 달 이름 옆 표시 (금리는 "발표 전")
  focus?: number; // 처음 선택해 둘 달 (기본: 집계 끝난 마지막 달)
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
  const h = hover ?? focus ?? lastDone;

  const layout = axisLayout(w);
  const { L0, R0 } = layout;
  const ts = timeScale(months, w, L0, R0);
  const pointer = pointerSelect(setHover, L0, ts.slot, n);

  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  const lo = Math.min(...all, ...(zero ? [0] : [])), hi = Math.max(...all, ...(zero ? [0] : []));
  const ticks = all.length ? niceTicks(lo, hi, 5) : [0, 1];
  const y = linearY(ticks, T, height, B);
  const hx = ts.X(h);

  const tags = lastTags(series, lastDone); // 오른쪽 태그: 계열별 집계 끝난 최근 값

  return (
    <section className={chartPanel}>
      <ChartTitle title={title} unit={unit} right={note && <span className="text-[11px] text-muted">{note}</span>} />
      <div className={`${chartPad} ${readoutRow}`}>
        <span className="font-semibold text-ink">
          {longYm(months[h])}
          {h >= partialFrom && <span className="ml-2 font-normal text-s2">{partialLabel}</span>}
        </span>
        {series.map((s) => <Swatch key={s.key} color={s.color} label={s.label} value={s.values[h] == null ? "-" : fmt(s.values[h]!)} />)}
      </div>
      <div ref={ref} className="w-full select-none" style={{ minHeight: height + XH }}>
        {w > 0 && all.length > 0 && (
          <>
            <svg width={w} height={height} className="block" role="img" aria-label={`${title} 월별 차트`} {...pointer}>
              <GridLines ticks={ticks} y={y} x0={L0} x1={w - R0} />
              {zero && ticks[0] < 0 && <path d={`M${L0} ${fx(y(0))} H${w - R0}`} stroke="var(--muted)" strokeDasharray="4 3" />}
              <YearMarks ts={ts} height={height} />
              {series.map((s) => <SeriesLine key={s.key} values={s.values} x={ts.X} y={y} base={height - B} partial={partialFrom} color={s.color} />)}
              <Crosshair x={hx} height={height} />
              {series.map((s) => (s.values[h] == null ? null : <HoverDot key={s.key} x={hx} y={y(s.values[h]!)} color={s.color} />))}
              <AxisTags items={tags} y={y} height={height} ticks={ticks} fmtTick={fmt} fmtTag={fmt} w={w} layout={layout} />
            </svg>
            <XAxis ts={ts} w={w} h={h} label={shortYm(months[h])} layout={layout} height={XH} />
          </>
        )}
        {all.length === 0 && <p className="py-12 text-center text-sm text-muted">표시할 값이 없습니다.</p>}
      </div>
      {children && <div className={`${chartPad} text-xs text-muted`}>{children}</div>}
    </section>
  );
}

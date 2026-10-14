"use client";

import { useState, type ReactNode } from "react";
import { linearY, niceTicks, timeScale, toIndex } from "@/lib/chart";
import { longYm, shortYm } from "@/lib/format";
import {
  AxisTags, axisLayout, chartPad, chartPanel, ChartTitle, Crosshair, fx, GridLines, HoverDot, lastTags, pointerSelect, SeriesLine, Swatch,
  useWidth, XAxis, YearMarks,
} from "./chartKit";

// 비교 차트: 대상(지역 또는 단지)별 가격 선 차트 + 월별 거래량 선 차트.
// 두 차트는 같은 시간축과 크로스헤어를 공유하고, 범례로 대상을 켜고 끈다.
// 색은 대상에 고정 — 하나를 꺼도 나머지 색이 바뀌지 않는다.

export interface CompareSeries {
  id: number | string;
  name: string;
  color: string;
  price: (number | null)[]; // 가격(만원), months와 같은 길이
  count: number[]; // 거래 건수
}

const PH = 340, PT = 24, PB = 6;
const VH = 200, VT = 16, VB = 6;
const XH = 26;

export interface CompareLabels {
  price: string; // 가격 차트 제목
  count: string; // 거래량 차트 제목
  noun: string; // 켜고 끄는 대상 (지역·단지)
}

const REGION_LABELS: CompareLabels = { price: "지역별 매매 중위가", count: "지역별 월별 매매 거래량", noun: "지역" };

export function CompareCharts({ months, partialFrom, series, mode, labels = REGION_LABELS }: {
  months: string[];
  partialFrom: number; // 이 인덱스부터 집계 중(점선)
  series: CompareSeries[];
  mode: "price" | "index";
  labels?: CompareLabels;
}) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number | string>>(new Set());

  const n = months.length;
  const shown = series.filter((s) => !hidden.has(s.id));
  const lastDone = Math.max(0, Math.min(partialFrom, n) - 1);
  const h = hover ?? lastDone;

  const vals = new Map(series.map((s) => [s.id, mode === "price" ? s.price.map((v) => (v == null ? null : v / 10000)) : toIndex(s.price)]));
  const fmt = (v: number | null) => (v == null ? "-" : mode === "price" ? `${v.toFixed(2)}억` : v.toFixed(0));
  const tagFmt = (v: number) => (mode === "price" ? v.toFixed(2) : v.toFixed(0));

  const toggle = (id: number | string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (series.length - next.size > 1) next.add(id); // 최소 하나는 남긴다
      return next;
    });

  const layout = axisLayout(w);
  const { L0, R0 } = layout;
  const ts = timeScale(months, w, L0, R0);
  const { X } = ts;
  const pointer = pointerSelect(setHover, L0, ts.slot, n);
  const hx = X(h);

  const pAll = shown.flatMap((s) => vals.get(s.id)!).filter((v): v is number => v != null);
  const pt = pAll.length ? niceTicks(Math.min(...pAll), Math.max(...pAll), 5) : [0, 1];
  const py = linearY(pt, PT, PH, PB);

  const ct = niceTicks(0, Math.max(1, ...shown.flatMap((s) => s.count)), 4);
  const cy = linearY(ct, VT, VH, VB); // 거래량 눈금은 0부터

  // 오른쪽 축 태그: 대상별로 집계가 끝난 최근 달의 값 (집계 중인 달은 덜 잡혀서 쓰지 않음, 그런 달뿐이면 마지막 값)
  const tagsOf = (valueAt: (s: CompareSeries) => (number | null)[]) =>
    lastTags(shown.map((s) => ({ key: s.id, color: s.color, values: valueAt(s) })), lastDone, true);

  const monthLabel = (
    <span className="font-semibold text-ink">
      {longYm(months[h])}
      {h >= partialFrom && <span className="ml-2 font-normal text-s2">집계 중</span>}
    </span>
  );
  // 선택한 달의 지역별 값: 넓은 화면은 한 줄, 좁은 화면은 2열 표
  const readout = (value: (s: CompareSeries) => string, extra?: ReactNode) => (
    <div className={`${chartPad} mono flex min-h-6 flex-col gap-1.5 text-xs text-ink-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4`}>
      <div className="flex items-center justify-between gap-3">{monthLabel}{extra && <span className="sm:hidden">{extra}</span>}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-4">
        {shown.map((s) => <Swatch key={s.id} color={s.color} label={s.name} value={value(s)} />)}
      </div>
      {extra && <span className="hidden sm:inline">{extra}</span>}
    </div>
  );

  return (
    <>
      <section className={chartPanel}>
        <ChartTitle title={labels.price} unit={mode === "price" ? "억 원" : "지수 · 기간 첫 3개월 평균 = 100"}
          right={<span className="mono text-[11px] text-muted">점선 = 신고 기한(30일) 안이라 집계 중</span>} />

        <div role="group" aria-label={`표시할 ${labels.noun}`} className={`${chartPad} flex gap-1.5 overflow-x-auto sm:flex-wrap`}>
          {series.map((s) => {
            const on = !hidden.has(s.id);
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.id)}
                className={`flex min-h-11 shrink-0 items-center gap-2 rounded border px-3 text-sm sm:min-h-9 ${on ? "border-line bg-surface-2 text-ink" : "border-transparent text-muted line-through"}`}
              >
                <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: on ? s.color : "var(--axis)" }} />
                {s.name}
              </button>
            );
          })}
        </div>

        {readout((s) => fmt(vals.get(s.id)![h]))}

        <div ref={ref} className="w-full select-none" style={{ minHeight: PH + XH }}>
          {w > 0 && (
            <>
              <svg width={w} height={PH} className="block" role="img" aria-label={`${labels.price} 비교 차트`} {...pointer}>
                <GridLines ticks={pt} y={py} x0={L0} x1={w - R0} />
                <YearMarks ts={ts} height={PH} />
                {mode === "index" && <path d={`M${L0} ${fx(py(100))} H${w - R0}`} stroke="var(--muted)" strokeDasharray="4 3" />}
                {shown.map((s) => <SeriesLine key={s.id} values={vals.get(s.id)!} x={X} y={py} base={PH} partial={partialFrom} color={s.color} />)}
                <Crosshair x={hx} height={PH} />
                {shown.map((s) => {
                  const v = vals.get(s.id)![h];
                  return v == null ? null : <HoverDot key={s.id} x={hx} y={py(v)} color={s.color} />;
                })}
                <AxisTags items={tagsOf((s) => vals.get(s.id)!)} y={py} height={PH} ticks={pt}
                  fmtTick={(v) => (mode === "price" ? `${v}억` : String(v))} fmtTag={tagFmt} w={w} layout={layout} />
              </svg>
              <XAxis ts={ts} w={w} h={h} label={shortYm(months[h])} layout={layout} height={XH} />
            </>
          )}
        </div>
      </section>

      <section className={chartPanel}>
        <ChartTitle title={labels.count} unit="건" />
        {readout((s) => String(s.count[h]), <>합계 <span className="text-ink">{shown.reduce((sum, s) => sum + s.count[h], 0)}</span></>)}
        <div className="w-full select-none" style={{ minHeight: VH + XH }}>
          {w > 0 && (
            <>
              <svg width={w} height={VH} className="block" role="img" aria-label={`${labels.count} 비교 차트`} {...pointer}>
                <GridLines ticks={ct} y={cy} x0={L0} x1={w - R0} />
                <YearMarks ts={ts} height={VH} labels={false} />
                {shown.map((s) => <SeriesLine key={s.id} values={s.count} x={X} y={cy} base={VH} partial={partialFrom} color={s.color} width={1.75} />)}
                <Crosshair x={hx} height={VH} />
                {shown.map((s) => <HoverDot key={s.id} x={hx} y={cy(s.count[h])} color={s.color} r={3.5} ring={2} />)}
                <AxisTags items={tagsOf((s) => s.count)} y={cy} height={VH} ticks={ct} fmtTick={String} fmtTag={String} w={w} layout={layout} />
              </svg>
              <XAxis ts={ts} w={w} h={h} label={shortYm(months[h])} layout={layout} height={XH} />
            </>
          )}
        </div>
      </section>
    </>
  );
}

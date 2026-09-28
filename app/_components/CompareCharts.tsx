"use client";

import { useState, type ReactNode } from "react";
import { niceTicks, seriesPaths, spreadLabels, toIndex } from "@/lib/chart";
import { longYm } from "@/lib/format";
import { axisLayout, chartPad, chartPanel, fx, pointerSelect, Swatch, Tag, timeScale, useWidth, XAxis, YearMarks, YLabel } from "./chartKit";

// 지역 비교: 지역별 매매 중위가 선 차트 + 월별 매매 거래량 선 차트.
// 두 차트는 같은 시간축과 크로스헤어를 공유하고, 범례로 지역을 켜고 끈다.
// 색은 지역에 고정(그룹 정렬 순서) — 지역을 꺼도 나머지 색이 바뀌지 않는다.

export interface CompareSeries {
  id: number;
  name: string;
  color: string;
  price: (number | null)[]; // 매매 중위가(만원), months와 같은 길이
  count: number[]; // 매매 건수
}

const PH = 340, PT = 24, PB = 6;
const VH = 200, VT = 16, VB = 6;
const XH = 26;

export function CompareCharts({ months, partialFrom, series, mode }: {
  months: string[];
  partialFrom: number; // 이 인덱스부터 집계 중(점선)
  series: CompareSeries[];
  mode: "price" | "index";
}) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());

  const n = months.length;
  const shown = series.filter((s) => !hidden.has(s.id));
  const lastDone = Math.max(0, Math.min(partialFrom, n) - 1);
  const h = hover ?? lastDone;

  const vals = new Map(series.map((s) => [s.id, mode === "price" ? s.price.map((v) => (v == null ? null : v / 10000)) : toIndex(s.price)]));
  const fmt = (v: number | null) => (v == null ? "-" : mode === "price" ? `${v.toFixed(2)}억` : v.toFixed(0));
  const tagFmt = (v: number) => (mode === "price" ? v.toFixed(2) : v.toFixed(0));

  const toggle = (id: number) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (series.length - next.size > 1) next.add(id); // 최소 한 지역은 남긴다
      return next;
    });

  const layout = axisLayout(w);
  const { L0, R0, font } = layout;
  const ts = timeScale(months, w, L0, R0);
  const { X } = ts;
  const pointer = pointerSelect(setHover, L0, ts.slot, n);
  const hx = X(h);

  const pAll = shown.flatMap((s) => vals.get(s.id)!).filter((v): v is number => v != null);
  const pt = pAll.length ? niceTicks(Math.min(...pAll), Math.max(...pAll), 5) : [0, 1];
  const py = (v: number) => PT + (PH - PT - PB) * (1 - (v - pt[0]) / (pt[pt.length - 1] - pt[0]));

  const ct = niceTicks(0, Math.max(1, ...shown.flatMap((s) => s.count)), 4);
  const cy = (v: number) => VT + (VH - VT - VB) * (1 - v / ct[ct.length - 1]);

  const grid = (ticks: number[], y: (v: number) => number) =>
    ticks.map((v) => <path key={v} d={`M${L0} ${fx(y(v))} H${w - R0}`} stroke="var(--grid)" strokeDasharray="2 4" />);

  // 오른쪽 축 태그: 지역별로 집계가 끝난 최근 달의 값 (집계 중인 달은 덜 잡혀서 쓰지 않음).
  // 태그끼리 겹치지 않게 벌리고, 넓은 화면에서는 태그와 겹치는 눈금 라벨을 숨긴다.
  const axisLabels = (
    valueAt: (s: CompareSeries) => (number | null)[],
    y: (v: number) => number,
    height: number,
    ticks: number[],
    fmtTick: (v: number) => string,
    fmtTag: (v: number) => string,
  ) => {
    const items = shown
      .map((s) => {
        const v = valueAt(s);
        const done = v.slice(0, lastDone + 1).findLastIndex((x) => x != null);
        const i = done >= 0 ? done : v.findLastIndex((x) => x != null);
        return i < 0 ? null : { s, v: v[i]! };
      })
      .filter((x): x is { s: CompareSeries; v: number } => x != null);
    const ys = spreadLabels(items.map((t) => y(t.v)), font + 11, 10, height - 10);
    const visible = ticks.slice(layout.compact ? 1 : 0).filter((v) => layout.compact || ys.every((ty) => Math.abs(ty - y(v)) >= 14));
    return (
      <>
        {visible.map((v) => <YLabel key={v} y={y(v)} text={fmtTick(v)} w={w} layout={layout} />)}
        {items.map((t, k) => <Tag key={t.s.id} x={w - R0 + 4} y={ys[k]} text={fmtTag(t.v)} bg={t.s.color} fg="var(--page)" font={font} />)}
      </>
    );
  };

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
        <div className={`${chartPad} flex flex-wrap items-center justify-between gap-2`}>
          <h2 className="text-sm font-semibold">
            지역별 매매 중위가{" "}
            <span className="mono text-xs font-normal text-muted">{mode === "price" ? "억 원" : "지수 · 기간 첫 3개월 평균 = 100"}</span>
          </h2>
          <span className="mono text-[11px] text-muted">점선 = 신고 기한(30일) 안이라 집계 중</span>
        </div>

        <div role="group" aria-label="표시할 지역" className={`${chartPad} flex gap-1.5 overflow-x-auto sm:flex-wrap`}>
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
              <svg width={w} height={PH} className="block" role="img" aria-label="지역별 월별 매매 중위가 비교 차트" {...pointer}>
                {grid(pt, py)}
                <YearMarks ts={ts} height={PH} />
                {mode === "index" && <path d={`M${L0} ${fx(py(100))} H${w - R0}`} stroke="var(--muted)" strokeDasharray="4 3" />}
                {shown.map((s) => <Line key={s.id} values={vals.get(s.id)!} x={X} y={py} base={PH} partial={partialFrom} color={s.color} />)}
                <path d={`M${fx(hx)} 0 V${PH}`} stroke="#6b7280" />
                {shown.map((s) => {
                  const v = vals.get(s.id)![h];
                  return v == null ? null : <circle key={s.id} cx={hx} cy={py(v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2.5} />;
                })}
                {axisLabels((s) => vals.get(s.id)!, py, PH, pt, (v) => (mode === "price" ? `${v}억` : String(v)), tagFmt)}
              </svg>
              <XAxis ts={ts} w={w} h={h} months={months} layout={layout} height={XH} />
            </>
          )}
        </div>
      </section>

      <section className={chartPanel}>
        <div className={`${chartPad} flex flex-wrap items-center justify-between gap-2`}>
          <h2 className="text-sm font-semibold">
            지역별 월별 매매 거래량 <span className="mono text-xs font-normal text-muted">건</span>
          </h2>
        </div>
        {readout((s) => String(s.count[h]), <>합계 <span className="text-ink">{shown.reduce((sum, s) => sum + s.count[h], 0)}</span></>)}
        <div className="w-full select-none" style={{ minHeight: VH + XH }}>
          {w > 0 && (
            <>
              <svg width={w} height={VH} className="block" role="img" aria-label="지역별 월별 매매 거래량 비교 차트" {...pointer}>
                {grid(ct, cy)}
                <YearMarks ts={ts} height={VH} labels={false} />
                {shown.map((s) => <Line key={s.id} values={s.count} x={X} y={cy} base={VH} partial={partialFrom} color={s.color} width={1.75} />)}
                <path d={`M${fx(hx)} 0 V${VH}`} stroke="#6b7280" />
                {shown.map((s) => <circle key={s.id} cx={hx} cy={cy(s.count[h])} r={3.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
                {axisLabels((s) => s.count, cy, VH, ct, String, String)}
              </svg>
              <XAxis ts={ts} w={w} h={h} months={months} layout={layout} height={XH} />
            </>
          )}
        </div>
      </section>
    </>
  );
}

function Line({ values, x, y, base, partial, color, width = 2 }: {
  values: (number | null)[];
  x: (i: number) => number;
  y: (v: number) => number;
  base: number;
  partial: number;
  color: string;
  width?: number;
}) {
  const p = seriesPaths(values, x, y, base, partial);
  return (
    <g>
      <path d={p.solid} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />
      <path d={p.dashed} fill="none" stroke={color} strokeWidth={width} strokeDasharray="3 4" strokeLinecap="round" />
    </g>
  );
}

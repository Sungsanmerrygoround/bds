"use client";

import { useState } from "react";
import { barPath, linearY, niceTicks, seriesPaths, timeScale } from "@/lib/chart";
import { formatEok, longYm, shortYm } from "@/lib/format";
import { axisLayout, chartPad, Crosshair, fx, GridLines, HoverDot, pointerSelect, readoutRow, Swatch, useWidth, XAxis, YearMarks, YLabel } from "./chartKit";

// 지역별 '입주 세대(막대) + 전세 중위가(선)'. 단위가 달라 한 축에 겹치지 않고 위아래 두 칸으로 나눈다.
// 모든 지역 칸이 같은 시간축과 크로스헤어를 공유한다.

export interface SupplyJeonsePanel {
  id: number;
  name: string;
  color: string;
  supply: number[]; // 월별 입주 세대
  jeonse: (number | null)[]; // 월별 전세 중위가(만원), 미래 달은 null
}

const LH = 130, LT = 12, LB = 4; // 전세 선
const BH = 64, BT = 6, BB = 2; // 입주 막대
const XH = 24;
const BIG = 500; // 이 세대 이상 입주한 달은 선 칸까지 세로 표시

export function SupplyJeonse({ months, partialFrom, nowIdx, panels }: {
  months: string[];
  partialFrom: number;
  nowIdx: number;
  panels: SupplyJeonsePanel[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const h = hover ?? Math.max(0, partialFrom - 1);
  return (
    <div className={`grid gap-4 ${panels.length > 1 ? "xl:grid-cols-2" : ""}`}>
      {panels.map((p) => (
        <Panel key={p.id} p={p} months={months} partialFrom={partialFrom} nowIdx={nowIdx} h={h} setHover={setHover} />
      ))}
    </div>
  );
}

function Panel({ p, months, partialFrom, nowIdx, h, setHover }: {
  p: SupplyJeonsePanel;
  months: string[];
  partialFrom: number;
  nowIdx: number;
  h: number;
  setHover: (i: number | null) => void;
}) {
  const { ref, w } = useWidth();
  const layout = axisLayout(Math.min(w, 600)); // 두 칸 배치에서도 축 라벨은 안쪽(좁은 형태)
  const { L0, R0 } = layout;
  const ts = timeScale(months, w, L0, R0);
  const pointer = pointerSelect(setHover, L0, ts.slot, months.length);

  const vals = p.jeonse.map((v) => (v == null ? null : v / 10000));
  const nums = vals.filter((v): v is number => v != null);
  const lt = nums.length ? niceTicks(Math.min(...nums), Math.max(...nums), 3) : [0, 1];
  const ly = linearY(lt, LT, LH, LB);
  const bt = niceTicks(0, Math.max(100, ...p.supply), 2);
  const by = linearY(bt, BT, BH, BB); // 입주 눈금은 0부터
  const bw = Math.max(1.5, Math.min(10, ts.slot * 0.7));
  const hx = ts.X(h);
  const line = seriesPaths(vals, ts.X, ly, LH - LB, partialFrom);

  let bars = "", future = "";
  p.supply.forEach((n, i) => {
    if (!n) return;
    const d = barPath(ts.X(i) - bw / 2, bw, by(n), BH - BB, 1.5);
    if (i > nowIdx) future += d;
    else bars += d;
  });

  return (
    <section className="panel -mx-4 flex flex-col gap-1.5 rounded-none border-x-0 pb-2 pt-3 sm:mx-0 sm:rounded-md sm:border-x sm:px-3">
      <div className={`${chartPad} ${readoutRow}`}>
        <span className="font-sans text-sm font-semibold text-ink">{p.name}</span>
        <span className="font-semibold text-ink">{longYm(months[h])}</span>
        <Swatch color="var(--series-2)" label="전세 중위" value={formatEok(p.jeonse[h])} />
        <Swatch color={p.color} label="입주" value={`${p.supply[h].toLocaleString()}세대`} />
      </div>
      <div ref={ref} className="w-full select-none" style={{ minHeight: LH + BH + XH }}>
        {w > 0 && (
          <>
            <svg width={w} height={LH} className="block" role="img" aria-label={`${p.name} 전세 중위가`} {...pointer}>
              <GridLines ticks={lt} y={ly} x0={L0} x1={w - R0} />
              <YearMarks ts={ts} height={LH} labels={false} />
              {p.supply.map((n, i) => (n >= BIG && i <= nowIdx ? (
                <path key={i} d={`M${fx(ts.X(i))} 0 V${LH}`} stroke={p.color} strokeOpacity={0.45} strokeDasharray="2 3" />
              ) : null))}
              <path d={line.area} fill="url(#grad-s2)" />
              <path d={line.solid} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeLinejoin="round" />
              <path d={line.dashed} fill="none" stroke="var(--series-2)" strokeWidth={2} strokeDasharray="3 4" />
              <Crosshair x={hx} height={LH} />
              {vals[h] != null && <HoverDot x={hx} y={ly(vals[h]!)} color="var(--series-2)" />}
              {lt.slice(1).map((v) => <YLabel key={v} y={ly(v)} text={`${v}억`} w={w} layout={layout} />)}
            </svg>
            <svg width={w} height={BH} className="block" aria-hidden="true" {...pointer}>
              <path d={`M0 0.5 H${w}`} stroke="var(--axis)" />
              <text x={L0} y={16} fontSize={10} fill="var(--muted)">입주 세대</text>
              <path d={bars} fill={p.color} />
              <path d={future} fill={p.color} fillOpacity={0.4} />
              <Crosshair x={hx} height={BH} />
              <path d={`M${L0} ${BH - BB + 0.5} H${w - R0}`} stroke="var(--axis)" />
              <text x={w - R0 + 6} y={by(bt[bt.length - 1]) + 9} className="mono" fontSize={10} fill="var(--muted)">{bt[bt.length - 1].toLocaleString()}</text>
            </svg>
            <XAxis ts={ts} w={w} h={h} label={shortYm(months[h])} layout={layout} height={XH} />
          </>
        )}
      </div>
    </section>
  );
}

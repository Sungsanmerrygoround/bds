"use client";

import { useState } from "react";
import { barPath, niceTicks, seriesPaths } from "@/lib/chart";
import { formatEok, longYm } from "@/lib/format";
import { axisLayout, chartPad, chartPanel, fx, pointerSelect, Swatch, Tag, timeScale, useWidth, XAxis, YearMarks, YLabel } from "./chartKit";

// 추이 화면의 중위가·전세가율·거래량 차트. 세 차트가 같은 시간축과 크로스헤어를 공유한다.
// 가격 축은 오른쪽(트레이딩 차트 관례), 최신 값과 크로스헤어 값은 축 위 태그로 표시.

export interface TermPoint {
  ym: string;
  trade: number | null; // 만원
  jeonse: number | null;
  tradeCount: number;
  jeonseCount: number;
  partial: boolean; // 신고 기한 안이라 집계 중
}

const PH = 320, PT = 24, PB = 4; // 가격 차트
const RH = 100, RT = 22, RB = 6; // 전세가율 차트
const XH = 26; // 날짜 눈금 줄
const VH = 150, VT = 10, VB = 4; // 거래량 차트

export function TrendTerminal({ data, title }: { data: TermPoint[]; title: string }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const months = data.map((d) => d.ym);
  const firstPartial = data.findIndex((d) => d.partial);
  const P = firstPartial < 0 ? data.length : firstPartial;
  const lastDone = data.findLastIndex((d, i) => i < P && d.trade != null);
  const h = hover ?? (lastDone >= 0 ? lastDone : data.length - 1);

  const trade = data.map((d) => (d.trade == null ? null : d.trade / 10000));
  const jeon = data.map((d) => (d.jeonse == null ? null : d.jeonse / 10000));
  const ratio = data.map((d) => (d.trade && d.jeonse ? (d.jeonse / d.trade) * 100 : null));
  const hd = data[h];

  const layout = axisLayout(w);
  const { L0, R0, font } = layout;
  const ts = timeScale(months, w, L0, R0);
  const { X } = ts;
  const pointer = pointerSelect(setHover, L0, ts.slot, ts.n);

  const priceVals = [...trade, ...jeon].filter((v): v is number => v != null);
  const pt = niceTicks(Math.min(...priceVals), Math.max(...priceVals), 5);
  const py = (v: number) => PT + (PH - PT - PB) * (1 - (v - pt[0]) / (pt[pt.length - 1] - pt[0]));

  const ratioVals = ratio.filter((v): v is number => v != null);
  const rt = ratioVals.length ? niceTicks(Math.min(...ratioVals), Math.max(...ratioVals), 2) : [];
  const ry = (v: number) => RT + (RH - RT - RB) * (1 - (v - rt[0]) / (rt[rt.length - 1] - rt[0]));

  const vt = niceTicks(0, Math.max(1, ...data.map((d) => Math.max(d.tradeCount, d.jeonseCount))), 4);
  const vy = (v: number) => VT + (VH - VT - VB) * (1 - v / vt[vt.length - 1]);

  const hx = X(h);
  const tagX = w - R0 + 4;
  const lastT = trade.findLastIndex((v) => v != null);
  const lastJ = jeon.findLastIndex((v) => v != null);
  // 크로스헤어 값 태그: 최신값 태그와 20px 안으로 붙으면 위/아래로 비켜 놓는다
  const hoverTagY = (() => {
    if (trade[h] == null) return null;
    const y = py(trade[h]!), ly = lastT >= 0 ? py(trade[lastT]!) : -99;
    return Math.abs(y - ly) < 20 ? ly + (y >= ly ? 20 : -20) : y;
  })();
  // 넓은 화면에서는 오른쪽 축의 눈금 라벨이 태그와 겹치면 숨긴다 (좁은 화면은 라벨이 왼쪽이라 겹치지 않음)
  const tagYs = [lastT >= 0 ? py(trade[lastT]!) : null, lastJ >= 0 ? py(jeon[lastJ]!) : null, hoverTagY].filter((v): v is number => v != null);
  const showTick = (y: number) => layout.compact || tagYs.every((t) => Math.abs(t - y) >= 14);

  return (
    <>
      <section className={chartPanel}>
        <div className={`${chartPad} flex flex-wrap items-center justify-between gap-2`}>
          <h2 className="text-sm font-semibold">
            월별 중위가 <span className="mono text-xs font-normal text-muted">{title}</span>
          </h2>
          <span className="mono text-[11px] text-muted">점선 = 신고 기한(30일) 안이라 집계 중</span>
        </div>
        <div className={`${chartPad} mono flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2`}>
          <span className="font-semibold text-ink">{longYm(hd.ym)}</span>
          <Swatch color="var(--series-1)" label="매매" value={formatEok(hd.trade)} />
          <Swatch color="var(--series-2)" label="전세" value={formatEok(hd.jeonse)} />
          <Swatch color="var(--series-3)" label="전세가율" value={ratio[h] == null ? "-" : `${Math.round(ratio[h]!)}%`} />
          <span>거래 <span className="text-ink">{hd.tradeCount}</span> / <span className="text-ink">{hd.jeonseCount}</span>건</span>
          {hd.partial && <span className="text-s2">집계 중</span>}
        </div>
        <div ref={ref} className="relative w-full select-none" style={{ height: PH + RH + XH + 4 }}>
          {w > 0 && priceVals.length > 0 && (
            <>
              <svg width={w} height={PH} className="absolute left-0 top-0 block" role="img" aria-label="월별 매매·전세 중위가 차트" {...pointer}>
                {pt.map((v) => <path key={v} d={`M${L0} ${fx(py(v))} H${w - R0}`} stroke="var(--grid)" strokeDasharray="2 4" />)}
                <YearMarks ts={ts} height={PH} />
                <Series values={jeon} x={X} y={py} base={PH - PB} partial={P} color="var(--series-2)" grad="grad-s2" />
                <Series values={trade} x={X} y={py} base={PH - PB} partial={P} color="var(--series-1)" grad="grad-s1" />
                <path d={`M${fx(hx)} 0 V${PH}`} stroke="#6b7280" />
                {trade[h] != null && (
                  <>
                    <path d={`M${L0} ${fx(py(trade[h]!))} H${w - R0}`} stroke="#6b7280" strokeDasharray="3 3" />
                    <circle cx={hx} cy={py(trade[h]!)} r={10} fill="var(--series-1)" fillOpacity={0.18} />
                    <circle cx={hx} cy={py(trade[h]!)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2.5} />
                  </>
                )}
                {jeon[h] != null && <circle cx={hx} cy={py(jeon[h]!)} r={4.5} fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2.5} />}
                {pt.slice(layout.compact ? 1 : 0).filter((v) => showTick(py(v))).map((v) => (
                  <YLabel key={v} y={py(v)} text={`${v}억`} w={w} layout={layout} />
                ))}
                {lastJ >= 0 && <Tag x={tagX} y={py(jeon[lastJ]!)} text={jeon[lastJ]!.toFixed(2)} bg="var(--series-2)" fg="var(--page)" font={font} />}
                {lastT >= 0 && <Tag x={tagX} y={py(trade[lastT]!)} text={trade[lastT]!.toFixed(2)} bg="var(--series-1)" fg="var(--page)" font={font} />}
                {hoverTagY != null && h !== lastT && <Tag x={tagX} y={hoverTagY} text={trade[h]!.toFixed(2)} bg="var(--tag)" fg="var(--ink)" font={font} />}
              </svg>

              {rt.length > 0 && (
                <svg width={w} height={RH} className="absolute left-0 block" style={{ top: PH + 4, ...pointer.style }} aria-hidden="true"
                  onPointerMove={pointer.onPointerMove} onPointerDown={pointer.onPointerDown} onPointerLeave={pointer.onPointerLeave}>
                  <path d={`M0 0.5 H${w}`} stroke="var(--axis)" />
                  {rt.map((v) => <path key={v} d={`M${L0} ${fx(ry(v))} H${w - R0}`} stroke="var(--grid)" strokeDasharray="2 4" />)}
                  <YearMarks ts={ts} height={RH} labels={false} />
                  <text x={L0} y={15} fontSize={11} letterSpacing="0.08em" fill="var(--muted)">전세가율</text>
                  <Series values={ratio} x={X} y={ry} base={RH - RB} partial={P} color="var(--series-3)" grad="grad-s3" width={1.75} />
                  <path d={`M${fx(hx)} 0 V${RH}`} stroke="#6b7280" />
                  {ratio[h] != null && <circle cx={hx} cy={ry(ratio[h]!)} r={4} fill="var(--series-3)" stroke="var(--surface)" strokeWidth={2.5} />}
                  {rt.map((v) => (
                    // 좁은 화면에서도 전세가율 라벨은 오른쪽(왼쪽 위에 '전세가율' 제목이 있음)
                    <text key={v} x={w - R0 + (layout.compact ? 6 : 10)} y={ry(v) + 4} className="mono" fontSize={font} fill="var(--muted)">{v}%</text>
                  ))}
                </svg>
              )}

              <div className="absolute left-0" style={{ top: PH + RH + 6 }}>
                <XAxis ts={ts} w={w} h={h} months={months} layout={layout} height={XH} />
              </div>
            </>
          )}
        </div>
      </section>

      <section className={chartPanel}>
        <div className={`${chartPad} flex flex-wrap items-center justify-between gap-2`}>
          <h2 className="text-sm font-semibold">월별 거래량</h2>
          <div className="mono flex gap-4 text-xs text-ink-2">
            <Swatch color="var(--series-1)" label="매매" value={`${hd.tradeCount}`} />
            <Swatch color="var(--series-2)" label="전세" value={`${hd.jeonseCount}`} />
          </div>
        </div>
        <div className="relative w-full select-none" style={{ height: VH }}>
          {w > 0 && (
            <svg width={w} height={VH} className="block" role="img" aria-label="월별 매매·전세 거래량 막대 차트" {...pointer}>
              {vt.slice(1).map((v) => <path key={v} d={`M${L0} ${fx(vy(v))} H${w - R0}`} stroke="var(--grid)" strokeDasharray="2 4" />)}
              <rect x={hx - ts.slot / 2} y={0} width={ts.slot} height={VH - VB} rx={3} fill="#fff" fillOpacity={0.035} />
              <Bars data={data} x={X} y={vy} base={VH - VB} slot={ts.slot} h={h} />
              <path d={`M${L0} ${VH - VB + 0.5} H${w - R0}`} stroke="var(--axis)" />
              {vt.slice(1, -1).map((v) => <YLabel key={v} y={vy(v)} text={String(v)} w={w} layout={layout} />)}
            </svg>
          )}
        </div>
      </section>
    </>
  );
}

function Series({ values, x, y, base, partial, color, grad, width = 2.25 }: {
  values: (number | null)[];
  x: (i: number) => number;
  y: (v: number) => number;
  base: number;
  partial: number;
  color: string;
  grad: string;
  width?: number;
}) {
  const p = seriesPaths(values, x, y, base, partial);
  return (
    <g>
      <path d={p.area} fill={`url(#${grad})`} />
      <path d={p.solid} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />
      <path d={p.dashed} fill="none" stroke={color} strokeWidth={width} strokeDasharray="3 4" strokeLinecap="round" />
    </g>
  );
}

function Bars({ data, x, y, base, slot, h }: {
  data: TermPoint[];
  x: (i: number) => number;
  y: (v: number) => number;
  base: number;
  slot: number;
  h: number;
}) {
  const bw = Math.max(1.5, Math.min(14, slot * 0.36));
  let t = "", j = "", th = "", jh = "";
  data.forEach((d, i) => {
    const a = barPath(x(i) - bw - 0.75, bw, y(d.tradeCount), base);
    const b = barPath(x(i) + 0.75, bw, y(d.jeonseCount), base);
    if (i === h) {
      th = a;
      jh = b;
    } else {
      t += a;
      j += b;
    }
  });
  return (
    <g>
      <path d={t} fill="var(--series-1)" fillOpacity={0.42} />
      <path d={j} fill="var(--series-2)" fillOpacity={0.34} />
      <path d={th} fill="var(--series-1)" />
      <path d={jh} fill="var(--series-2)" />
    </g>
  );
}

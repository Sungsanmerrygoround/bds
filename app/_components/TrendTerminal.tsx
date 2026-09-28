"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { barPath, niceTicks, seriesPaths } from "@/lib/chart";

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

const L0 = 10, R0 = 66; // 좌우 여백 (오른쪽은 가격 축)
const PH = 320, PT = 24, PB = 4; // 가격 차트
const RH = 100, RT = 22, RB = 6; // 전세가율 차트
const XH = 26; // 날짜 눈금 줄
const VH = 150, VT = 10, VB = 4; // 거래량 차트

const eok = (man: number) => `${(man / 10000).toFixed(2)}억`;
const f = (v: number) => Number(v.toFixed(1));

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

function Tag({ x, y, text, bg, fg }: { x: number; y: number; text: string; bg: string; fg: string }) {
  const tw = text.length * 6.8 + 12;
  return (
    <g>
      <rect x={x} y={y - 10} width={tw} height={20} rx={3} fill={bg} />
      <text x={x + 6} y={y + 4} className="mono" fontSize={11} fontWeight={600} fill={fg}>{text}</text>
    </g>
  );
}

export function TrendTerminal({ data, title }: { data: TermPoint[]; title: string }) {
  const { ref, w } = useWidth();
  const [hover, setHover] = useState<number | null>(null);

  const n = data.length;
  const firstPartial = data.findIndex((d) => d.partial);
  const P = firstPartial < 0 ? n : firstPartial;
  const lastDone = data.findLastIndex((d, i) => i < P && d.trade != null);
  const h = hover ?? (lastDone >= 0 ? lastDone : n - 1);

  const trade = data.map((d) => (d.trade == null ? null : d.trade / 10000));
  const jeon = data.map((d) => (d.jeonse == null ? null : d.jeonse / 10000));
  const ratio = data.map((d) => (d.trade && d.jeonse ? (d.jeonse / d.trade) * 100 : null));
  const hd = data[h];

  const readout = (
    <div className="mono flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      <span className="font-semibold text-ink">{hd.ym.slice(0, 4)}년 {Number(hd.ym.slice(4))}월</span>
      <Swatch color="var(--series-1)" label="매매" value={hd.trade == null ? "-" : eok(hd.trade)} />
      <Swatch color="var(--series-2)" label="전세" value={hd.jeonse == null ? "-" : eok(hd.jeonse)} />
      <Swatch color="var(--series-3)" label="전세가율" value={ratio[h] == null ? "-" : `${Math.round(ratio[h]!)}%`} />
      <span>거래 <span className="text-ink">{hd.tradeCount}</span> / <span className="text-ink">{hd.jeonseCount}</span>건</span>
      {hd.partial && <span className="text-s2">집계 중</span>}
    </div>
  );

  // ----- 좌표 -----
  const IW = Math.max(1, w - L0 - R0);
  const X = (i: number) => (n === 1 ? L0 + IW / 2 : L0 + (IW * i) / (n - 1));
  const SLOT = n > 1 ? IW / (n - 1) : IW;

  const priceVals = [...trade, ...jeon].filter((v): v is number => v != null);
  const pt = niceTicks(Math.min(...priceVals), Math.max(...priceVals), 5);
  const py = (v: number) => PT + (PH - PT - PB) * (1 - (v - pt[0]) / (pt[pt.length - 1] - pt[0]));

  const ratioVals = ratio.filter((v): v is number => v != null);
  const rt = ratioVals.length ? niceTicks(Math.min(...ratioVals), Math.max(...ratioVals), 2) : [];
  const ry = (v: number) => RT + (RH - RT - RB) * (1 - (v - rt[0]) / (rt[rt.length - 1] - rt[0]));

  const vt = niceTicks(0, Math.max(1, ...data.map((d) => Math.max(d.tradeCount, d.jeonseCount))), 4);
  const vy = (v: number) => VT + (VH - VT - VB) * (1 - v / vt[vt.length - 1]);

  // 날짜 눈금: 기간 길이에 따라 매월 / 분기 / 반기. 1월에는 연도 구분선.
  const month = (i: number) => Number(data[i].ym.slice(4));
  // 눈금 간격: 라벨 사이가 44px 이상 되는 가장 촘촘한 간격 (1·3·6·12개월)
  const every = [1, 3, 6, 12].find((m) => SLOT * m >= 44) ?? 12;
  const xTicks = data.map((_, i) => i).filter((i) => (month(i) - 1) % every === 0);
  const jans = data.map((_, i) => i).filter((i) => month(i) === 1 && i > 0);
  // 첫 연도 라벨은 다음 1월 라벨과 겹치지 않을 때만
  const yearLabels = [...(jans.length === 0 || X(jans[0]) - X(0) >= 48 ? [0] : []), ...jans].map((i) => ({ i, label: data[i].ym.slice(0, 4) }));

  const hx = X(h);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - r.left - L0) / SLOT);
    setHover(Math.min(n - 1, Math.max(0, i)));
  };
  const pointer = {
    onPointerMove: onMove,
    onPointerDown: onMove,
    onPointerLeave: () => setHover(null),
    style: { touchAction: "pan-y" as const },
  };

  const lastT = trade.findLastIndex((v) => v != null);
  const lastJ = jeon.findLastIndex((v) => v != null);
  // 축 태그와 겹치는 눈금 라벨은 숨긴다
  const tagYs = [lastT >= 0 ? py(trade[lastT]!) : null, lastJ >= 0 ? py(jeon[lastJ]!) : null, trade[h] != null ? py(trade[h]!) : null]
    .filter((v): v is number => v != null);
  const clearOfTags = (y: number) => tagYs.every((t) => Math.abs(t - y) >= 14);

  return (
    <>
      <section className="panel flex flex-col gap-2 px-4 pb-3 pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            월별 중위가 <span className="mono text-xs font-normal text-muted">{title}</span>
          </h2>
          <span className="mono text-[11px] text-muted">점선 = 신고 기한(30일) 안이라 집계 중</span>
        </div>
        {readout}
        <div ref={ref} className="relative w-full select-none" style={{ height: PH + RH + XH + 4 }}>
          {w > 0 && priceVals.length > 0 && (
            <>
              <svg width={w} height={PH} className="absolute left-0 top-0 block" role="img" aria-label="월별 매매·전세 중위가 차트" {...pointer}>
                {pt.map((v) => <path key={v} d={`M${L0} ${f(py(v))} H${w - R0}`} stroke="var(--grid)" strokeDasharray="2 4" />)}
                {jans.map((i) => <path key={i} d={`M${f(X(i))} 0 V${PH}`} stroke="var(--year)" />)}
                {yearLabels.map((y) => (
                  <text key={y.i} x={X(y.i) + 6} y={14} className="mono" fontSize={11} fontWeight={600} fill="#c4c8d0">{y.label}</text>
                ))}
                <Series values={jeon} x={X} y={py} base={PH - PB} partial={P} color="var(--series-2)" grad="grad-s2" />
                <Series values={trade} x={X} y={py} base={PH - PB} partial={P} color="var(--series-1)" grad="grad-s1" />
                <path d={`M${f(hx)} 0 V${PH}`} stroke="#6b7280" />
                {trade[h] != null && (
                  <>
                    <path d={`M${L0} ${f(py(trade[h]!))} H${w - R0}`} stroke="#6b7280" strokeDasharray="3 3" />
                    <circle cx={hx} cy={py(trade[h]!)} r={10} fill="var(--series-1)" fillOpacity={0.18} />
                    <circle cx={hx} cy={py(trade[h]!)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2.5} />
                  </>
                )}
                {jeon[h] != null && <circle cx={hx} cy={py(jeon[h]!)} r={4.5} fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2.5} />}
                {pt.filter((v) => clearOfTags(py(v))).map((v) => (
                  <text key={v} x={w - R0 + 10} y={py(v) + 4} className="mono" fontSize={11} fill="var(--muted)">{v}억</text>
                ))}
                {lastJ >= 0 && <Tag x={w - R0 + 4} y={py(jeon[lastJ]!)} text={jeon[lastJ]!.toFixed(2)} bg="var(--series-2)" fg="var(--page)" />}
                {lastT >= 0 && <Tag x={w - R0 + 4} y={py(trade[lastT]!)} text={trade[lastT]!.toFixed(2)} bg="var(--series-1)" fg="var(--page)" />}
                {trade[h] != null && h !== lastT && (
                  // 최신값 태그와 20px 안으로 붙으면 위/아래로 비켜 놓는다
                  <Tag
                    x={w - R0 + 4}
                    y={(() => {
                      const y = py(trade[h]!), ly = lastT >= 0 ? py(trade[lastT]!) : -99;
                      return Math.abs(y - ly) < 20 ? ly + (y >= ly ? 20 : -20) : y;
                    })()}
                    text={trade[h]!.toFixed(2)}
                    bg="var(--tag)"
                    fg="var(--ink)"
                  />
                )}
              </svg>

              {rt.length > 0 && (
                <svg width={w} height={RH} className="absolute left-0 block" style={{ top: PH + 4, touchAction: "pan-y" }} aria-hidden="true"
                  onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
                  <path d={`M0 0.5 H${w}`} stroke="var(--axis)" />
                  {rt.map((v) => <path key={v} d={`M${L0} ${f(ry(v))} H${w - R0}`} stroke="var(--grid)" strokeDasharray="2 4" />)}
                  {jans.map((i) => <path key={i} d={`M${f(X(i))} 0 V${RH}`} stroke="var(--year)" />)}
                  <text x={L0} y={15} fontSize={11} letterSpacing="0.08em" fill="var(--muted)">전세가율</text>
                  <Series values={ratio} x={X} y={ry} base={RH - RB} partial={P} color="var(--series-3)" grad="grad-s3" width={1.75} />
                  <path d={`M${f(hx)} 0 V${RH}`} stroke="#6b7280" />
                  {ratio[h] != null && <circle cx={hx} cy={ry(ratio[h]!)} r={4} fill="var(--series-3)" stroke="var(--surface)" strokeWidth={2.5} />}
                  {rt.map((v) => (
                    <text key={v} x={w - R0 + 10} y={ry(v) + 4} className="mono" fontSize={11} fill="var(--muted)">{v}%</text>
                  ))}
                </svg>
              )}

              <svg width={w} height={XH} className="absolute left-0 block" style={{ top: PH + RH + 6 }} aria-hidden="true">
                {xTicks.map((i) => (
                  <text key={i} x={X(i)} y={16} textAnchor="middle" className="mono" fontSize={11} fill="var(--muted)">
                    {every >= 6 ? `${data[i].ym.slice(2, 4)}.${data[i].ym.slice(4)}` : `${month(i)}월`}
                  </text>
                ))}
                <Tag
                  x={Math.min(Math.max(hx - 27, 0), w - R0 - 54)}
                  y={12}
                  text={`${hd.ym.slice(2, 4)}.${hd.ym.slice(4)}`}
                  bg="var(--tag)"
                  fg="var(--ink)"
                />
              </svg>
            </>
          )}
        </div>
      </section>

      <section className="panel flex flex-col gap-2 px-4 pb-3 pt-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">월별 거래량</h2>
          <div className="mono flex gap-4 text-xs text-ink-2">
            <Swatch color="var(--series-1)" label="매매" value={`${hd.tradeCount}`} />
            <Swatch color="var(--series-2)" label="전세" value={`${hd.jeonseCount}`} />
          </div>
        </div>
        <div className="relative w-full select-none" style={{ height: VH }}>
          {w > 0 && (
            <svg width={w} height={VH} className="block" role="img" aria-label="월별 매매·전세 거래량 막대 차트" {...pointer}>
              {vt.slice(1).map((v) => <path key={v} d={`M${L0} ${f(vy(v))} H${w - R0}`} stroke="var(--grid)" strokeDasharray="2 4" />)}
              <rect x={hx - SLOT / 2} y={0} width={SLOT} height={VH - VB} rx={3} fill="#fff" fillOpacity={0.035} />
              <Bars data={data} x={X} y={vy} base={VH - VB} slot={SLOT} h={h} />
              <path d={`M${L0} ${VH - VB + 0.5} H${w - R0}`} stroke="var(--axis)" />
              {vt.slice(0, -1).map((v) => (
                <text key={v} x={w - R0 + 10} y={vy(v) + 4} className="mono" fontSize={11} fill="var(--muted)">{v}</text>
              ))}
            </svg>
          )}
        </div>
      </section>
    </>
  );
}

function Swatch({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label} <span className="text-ink">{value}</span>
    </span>
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

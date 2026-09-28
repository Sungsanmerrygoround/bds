"use client";

import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis,
} from "recharts";
import type { ReactNode } from "react";

// 공통: 가로축 = 시간. 월 단위 차트는 기간 내 모든 달을 채워 넣어 간격이 실제 시간과 같다.

/** recharts 3 툴팁 content: 활성 지점의 원본 데이터 행만 넘겨준다 */
function tip(render: (p: { payload: unknown }) => ReactNode) {
  return (props: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) =>
    props.active ? render({ payload: props.payload?.[0]?.payload }) : null;
}

const AXIS = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 12 }, tickLine: false } as const;
const eok = (man: number) => `${(man / 10000).toFixed(man >= 100000 ? 1 : 2)}억`;
/** 축 눈금: 24억, 7.5억 (불필요한 0 없이) */
const axisEok = (man: number) => `${Number((man / 10000).toFixed(1))}억`;
const ymLabel = (ym: string) => `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;

/** 눈금: 8개 안팎이 되도록 1/3/6/12개월 간격, 1월 기준 정렬 */
function monthTicks(months: string[]): string[] {
  const n = months.length;
  const step = n <= 12 ? 1 : n <= 24 ? 3 : n <= 60 ? 6 : 12;
  return months.filter((ym) => (Number(ym.slice(4)) - 1) % step === 0);
}

export function Legend({ items }: { items: { color: string; label: string; hollow?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={i.hollow ? { border: `2px solid ${i.color}` } : { background: i.color }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function TipBox({ title, rows, note }: { title: string; rows: { color?: string; label: string; value: ReactNode }[]; note?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            {r.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tnum text-ink">{r.value}</span>
        </div>
      ))}
      {note && <div className="mt-1 text-muted">{note}</div>}
    </div>
  );
}

// ---------- 지역 추이 ----------

export interface TrendPoint {
  ym: string;
  trade: number | null;
  jeonse: number | null;
  tradeCount: number;
  jeonseCount: number;
  partial: boolean; // 신고 기한(계약 후 30일) 때문에 아직 덜 집계된 달
}

function EndLabel({ x: rx, y: ry, index, lastIndex, text, color }: { x?: number | string; y?: number | string; index?: number; lastIndex: number; text: string; color: string }) {
  const x = rx == null ? null : Number(rx);
  const y = ry == null ? null : Number(ry);
  if (index !== lastIndex || x == null || y == null) return null;
  return (
    <g>
      <circle cx={x} cy={y} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
      <text x={x + 8} y={y + 4} fontSize={12} fill="var(--ink-2)">{text}</text>
    </g>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const lastT = data.findLastIndex((d) => d.trade != null);
  const lastJ = data.findLastIndex((d) => d.jeonse != null);
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="ym" ticks={monthTicks(data.map((d) => d.ym))} tickFormatter={ymLabel} {...AXIS} />
          <YAxis tickFormatter={axisEok} width={56} axisLine={false} {...AXIS} domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={tip((p) => {
              const d = p.payload as TrendPoint | undefined;
              if (!d) return null;
              const ratio = d.trade && d.jeonse ? `${Math.round((d.jeonse / d.trade) * 100)}%` : "-";
              return (
                <TipBox
                  title={`${d.ym.slice(0, 4)}년 ${Number(d.ym.slice(4))}월`}
                  rows={[
                    { color: "var(--series-1)", label: `매매 중위가 (${d.tradeCount}건)`, value: d.trade == null ? "-" : eok(d.trade) },
                    { color: "var(--series-2)", label: `전세 중위가 (${d.jeonseCount}건)`, value: d.jeonse == null ? "-" : eok(d.jeonse) },
                    { label: "전세가율", value: ratio },
                  ]}
                  note={d.partial ? "신고 기한(30일) 안이라 아직 집계 중" : undefined}
                />
              );
            })}
          />
          <Line
            type="monotone" dataKey="trade" stroke="var(--series-1)" strokeWidth={2} dot={false} connectNulls
            activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false}
            label={(p) => <EndLabel key="t" {...p} lastIndex={lastT} text="매매" color="var(--series-1)" />}
          />
          <Line
            type="monotone" dataKey="jeonse" stroke="var(--series-2)" strokeWidth={2} dot={false} connectNulls
            activeDot={{ r: 5, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false}
            label={(p) => <EndLabel key="j" {...p} lastIndex={lastJ} text="전세" color="var(--series-2)" />}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VolumeChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: 4 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="ym" ticks={monthTicks(data.map((d) => d.ym))} tickFormatter={ymLabel} {...AXIS} />
          <YAxis width={56} axisLine={false} allowDecimals={false} {...AXIS} />
          <Tooltip
            cursor={{ fill: "var(--wash)" }}
            content={tip((p) => {
              const d = p.payload as TrendPoint | undefined;
              if (!d) return null;
              return (
                <TipBox
                  title={`${d.ym.slice(0, 4)}년 ${Number(d.ym.slice(4))}월`}
                  rows={[
                    { color: "var(--series-1)", label: "매매", value: `${d.tradeCount}건` },
                    { color: "var(--series-2)", label: "전세", value: `${d.jeonseCount}건` },
                  ]}
                  note={d.partial ? "신고 기한(30일) 안이라 아직 집계 중" : undefined}
                />
              );
            })}
          />
          <Bar dataKey="tradeCount" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="jeonseCount" fill="var(--series-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- 단지 거래 산점도 ----------

export interface DealDot {
  t: number; // 계약일 epoch ms
  price: number; // 만원
  kind: "매매" | "전세";
  date: string;
  floor: number | null;
  direct: boolean;
  tag?: string; // 신고가 +5.2% 등
}

function Dot(props: { cx?: number; cy?: number; payload?: DealDot; color: string }) {
  const { cx, cy, payload, color } = props;
  if (cx == null || cy == null) return null;
  return payload?.direct ? (
    <circle cx={cx} cy={cy} r={4} fill="var(--surface)" stroke={color} strokeWidth={2} />
  ) : (
    <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
  );
}

export function DealScatter({ trades, jeonse, from, to }: { trades: DealDot[]; jeonse: DealDot[]; from: string; to: string }) {
  const start = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(4)) - 1, 1);
  const end = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(4)), 1);
  const months: string[] = [];
  for (let d = new Date(start); d.getTime() < end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    months.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const ticks = monthTicks(months).map((ym) => Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(4)) - 1, 1));
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            type="number" dataKey="t" domain={[start, end]} ticks={ticks} scale="time" {...AXIS}
            tickFormatter={(v: number) => { const d = new Date(v); return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`; }}
          />
          <YAxis type="number" dataKey="price" tickFormatter={axisEok} width={56} axisLine={false} domain={["auto", "auto"]} {...AXIS} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={tip((p) => {
              const d = p.payload as DealDot | undefined;
              if (!d) return null;
              return (
                <TipBox
                  title={d.date}
                  rows={[
                    { color: d.kind === "매매" ? "var(--series-1)" : "var(--series-2)", label: d.kind, value: eok(d.price) },
                    { label: "층", value: d.floor ?? "-" },
                  ]}
                  note={[d.direct ? "직거래" : null, d.tag].filter(Boolean).join(" · ") || undefined}
                />
              );
            })}
          />
          <Scatter name="전세" data={jeonse} isAnimationActive={false} shape={(p: object) => <Dot {...p} color="var(--series-2)" />} />
          <Scatter name="매매" data={trades} isAnimationActive={false} shape={(p: object) => <Dot {...p} color="var(--series-1)" />} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- 입주 물량 ----------

export interface SupplyPoint {
  ym: string;
  [groupKey: string]: number | string;
}

export function SupplyChart({ data, series, nowYm }: { data: SupplyPoint[]; series: { key: string; label: string; color: string }[]; nowYm: string }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 4 }} barCategoryGap="15%">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="ym" ticks={monthTicks(data.map((d) => d.ym))} tickFormatter={ymLabel} {...AXIS} />
          <YAxis width={56} axisLine={false} allowDecimals={false} tickFormatter={(v: number) => v.toLocaleString()} {...AXIS} />
          <ReferenceLine x={nowYm} stroke="var(--muted)" strokeDasharray="3 3" label={{ value: "이번 달", position: "top", fill: "var(--muted)", fontSize: 11 }} />
          <Tooltip
            cursor={{ fill: "var(--wash)" }}
            content={tip((p) => {
              const d = p.payload as SupplyPoint | undefined;
              if (!d) return null;
              const total = series.reduce((s, x) => s + Number(d[x.key] ?? 0), 0);
              return (
                <TipBox
                  title={`${d.ym.slice(0, 4)}년 ${Number(d.ym.slice(4, 6))}월 입주 예정`}
                  rows={[
                    ...series.filter((x) => Number(d[x.key] ?? 0) > 0).map((x) => ({ color: x.color, label: x.label, value: `${Number(d[x.key]).toLocaleString()}세대` })),
                    { label: "합계", value: `${total.toLocaleString()}세대` },
                  ]}
                />
              );
            })}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--surface)" strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

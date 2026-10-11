"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { seriesPaths, spreadLabels } from "@/lib/chart";

// 직접 그리는 SVG 시계열 차트(추이·지역 비교)가 함께 쓰는 부품

export const fx = (v: number) => Number(v.toFixed(1));

/** 차트 패널: 모바일에서는 화면 폭 끝까지(좌우 테두리 없음), sm 이상은 일반 패널 */
export const chartPanel = "panel -mx-4 flex flex-col gap-2 rounded-none border-x-0 pb-3 pt-3.5 sm:mx-0 sm:rounded-md sm:border-x sm:px-4";
/** 패널 안 제목·수치 줄: 모바일에서만 좌우 여백 */
export const chartPad = "px-4 sm:px-0";

/** 요소의 실제 폭(px). 처음 렌더에서는 0 */
export function useWidth() {
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

/**
 * 가로 배치. 좁은 화면(640px 미만)에서는 오른쪽 여백을 태그 폭만 남기고
 * y 눈금 라벨을 차트 안쪽 왼쪽(격자선 위)에 둔다.
 */
export function axisLayout(w: number) {
  const compact = w < 640;
  return { compact, L0: compact ? 12 : 10, R0: compact ? 46 : 66, font: compact ? 10 : 11 };
}

/** 시간축: 월 인덱스 → x, 눈금(1·3·6·12개월 중 라벨 간격 44px 이상), 연도 구분 */
export function timeScale(months: string[], w: number, L0: number, R0: number) {
  const n = months.length;
  const IW = Math.max(1, w - L0 - R0);
  const X = (i: number) => (n === 1 ? L0 + IW / 2 : L0 + (IW * i) / (n - 1));
  const slot = n > 1 ? IW / (n - 1) : IW;
  const month = (i: number) => Number(months[i].slice(4));
  const every = [1, 3, 6, 12].find((m) => slot * m >= 44) ?? 12;
  const idx = months.map((_, i) => i);
  const xTicks = idx
    .filter((i) => (month(i) - 1) % every === 0)
    .map((i) => ({ i, label: every >= 6 ? `${months[i].slice(2, 4)}.${months[i].slice(4)}` : `${month(i)}월` }));
  const jans = idx.filter((i) => month(i) === 1 && i > 0);
  // 첫 연도 라벨은 다음 1월 라벨과 겹치지 않을 때만
  const yearLabels = [...(jans.length === 0 || X(jans[0]) - X(0) >= 48 ? [0] : []), ...jans].map((i) => ({ i, label: months[i].slice(0, 4) }));
  return { n, X, slot, xTicks, jans, yearLabels };
}

/** 포인터(마우스·터치) 위치로 월을 고르는 핸들러. 세로 스크롤은 막지 않는다. */
export function pointerSelect(setHover: (i: number | null) => void, L0: number, slot: number, n: number) {
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(n - 1, Math.max(0, Math.round((e.clientX - r.left - L0) / slot))));
  };
  // 터치는 손가락을 뗄 때도 pointerleave가 와서, 초기화는 마우스일 때만 (터치로 고른 달은 유지)
  const onLeave = (e: PointerEvent<SVGSVGElement>) => e.pointerType === "mouse" && setHover(null);
  return { onPointerMove: onMove, onPointerDown: onMove, onPointerLeave: onLeave, style: { touchAction: "pan-y" as const } };
}

/** 축 위 값 태그 (고정폭 글꼴 기준으로 폭 계산) */
export function Tag({ x, y, text, bg, fg, font = 11 }: { x: number; y: number; text: string; bg: string; fg: string; font?: number }) {
  const tw = text.length * font * 0.62 + 12;
  const th = font + 9;
  return (
    <g>
      <rect x={x} y={y - th / 2} width={tw} height={th} rx={3} fill={bg} />
      <text x={x + 6} y={y + font * 0.36} className="mono" fontSize={font} fontWeight={600} fill={fg}>{text}</text>
    </g>
  );
}

/** y 눈금 라벨: 넓은 화면은 오른쪽 축, 좁은 화면은 차트 안쪽 왼쪽 */
export function YLabel({ y, text, w, layout }: { y: number; text: string; w: number; layout: ReturnType<typeof axisLayout> }) {
  return layout.compact ? (
    <text x={layout.L0} y={y - 4} className="mono" fontSize={layout.font} fill="var(--muted)">{text}</text>
  ) : (
    <text x={w - layout.R0 + 10} y={y + 4} className="mono" fontSize={layout.font} fill="var(--muted)">{text}</text>
  );
}

export function Swatch({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />
      {label} <span className="text-ink">{value}</span>
    </span>
  );
}

/** 연도 구분선과 연도 라벨 */
export function YearMarks({ ts, height, labels = true }: { ts: ReturnType<typeof timeScale>; height: number; labels?: boolean }) {
  return (
    <>
      {ts.jans.map((i) => <path key={i} d={`M${fx(ts.X(i))} 0 V${height}`} stroke="var(--year)" />)}
      {labels && ts.yearLabels.map((y) => (
        <text key={y.i} x={ts.X(y.i) + 6} y={14} className="mono" fontSize={11} fontWeight={600} fill="#c4c8d0">{y.label}</text>
      ))}
    </>
  );
}

/** 날짜 눈금 줄 + 선택한 달 태그 */
export function XAxis({ ts, w, h, months, layout, height = 26 }: {
  ts: ReturnType<typeof timeScale>;
  w: number;
  h: number;
  months: string[];
  layout: ReturnType<typeof axisLayout>;
  height?: number;
}) {
  const hx = ts.X(h);
  return (
    <svg width={w} height={height} className="block" aria-hidden="true">
      {ts.xTicks.map((t) => (
        <text key={t.i} x={ts.X(t.i)} y={16} textAnchor="middle" className="mono" fontSize={layout.font} fill="var(--muted)">{t.label}</text>
      ))}
      <Tag
        x={Math.min(Math.max(hx - 27, 0), w - 54)}
        y={12}
        text={`${months[h].slice(2, 4)}.${months[h].slice(4)}`}
        bg="var(--tag)"
        fg="var(--ink)"
        font={layout.font}
      />
    </svg>
  );
}

/** 선택한 시점의 값 줄 (월·주 이름 + 계열별 값) */
export const readoutRow = "mono flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2";

/** 차트 제목 줄: 제목 + 단위(작게) + 오른쪽 내용(주석·범례 등) */
export function ChartTitle({ title, unit, right }: { title: ReactNode; unit?: ReactNode; right?: ReactNode }) {
  return (
    <div className={`${chartPad} flex flex-wrap items-center justify-between gap-2`}>
      <h2 className="text-sm font-semibold">
        {title}
        {unit != null && <> <span className="mono text-xs font-normal text-muted">{unit}</span></>}
      </h2>
      {right}
    </div>
  );
}

/** 가로 격자선 (점선) */
export function GridLines({ ticks, y, x0, x1 }: { ticks: number[]; y: (v: number) => number; x0: number; x1: number }) {
  return <>{ticks.map((v) => <path key={v} d={`M${x0} ${fx(y(v))} H${x1}`} stroke="var(--grid)" strokeDasharray="2 4" />)}</>;
}

/** 선택한 시점의 세로선 */
export function Crosshair({ x, height }: { x: number; height: number }) {
  return <path d={`M${fx(x)} 0 V${height}`} stroke="#6b7280" />;
}

/** 선택한 시점의 계열 점 */
export function HoverDot({ x, y, color, r = 4, ring = 2.5 }: { x: number; y: number; color: string; r?: number; ring?: number }) {
  return <circle cx={x} cy={y} r={r} fill={color} stroke="var(--surface)" strokeWidth={ring} />;
}

/** 선 계열: 확정 구간은 실선, partial 인덱스부터(집계 중) 점선 */
export function SeriesLine({ values, x, y, base, partial, color, width = 2 }: {
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

/**
 * 오른쪽 축: 계열별 값 태그(겹치지 않게 벌림) + 눈금 라벨.
 * 넓은 화면에서는 태그와 14px 안으로 겹치는 눈금 라벨을 숨기고, 좁은 화면은 맨 아래 눈금을 뺀다(라벨이 왼쪽 안쪽이라).
 */
export function AxisTags({ items, y, height, ticks, fmtTick, fmtTag, w, layout }: {
  items: { key: string | number; value: number; color: string }[];
  y: (v: number) => number;
  height: number;
  ticks: number[];
  fmtTick: (v: number) => string;
  fmtTag: (v: number) => string;
  w: number;
  layout: ReturnType<typeof axisLayout>;
}) {
  const ys = spreadLabels(items.map((t) => y(t.value)), layout.font + 11, 10, height - 10);
  const visible = ticks.slice(layout.compact ? 1 : 0).filter((v) => layout.compact || ys.every((ty) => Math.abs(ty - y(v)) >= 14));
  return (
    <>
      {visible.map((v) => <YLabel key={v} y={y(v)} text={fmtTick(v)} w={w} layout={layout} />)}
      {items.map((t, k) => <Tag key={t.key} x={w - layout.R0 + 4} y={ys[k]} text={fmtTag(t.value)} bg={t.color} fg="var(--page)" font={layout.font} />)}
    </>
  );
}

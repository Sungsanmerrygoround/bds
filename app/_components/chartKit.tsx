"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

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

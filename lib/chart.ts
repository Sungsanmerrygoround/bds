// 차트용 순수 함수: 단조 3차 곡선 경로, 눈금, 결측 구간 분리

export type Pt = [number, number];

const f = (v: number) => v.toFixed(1);

/** Fritsch–Carlson 단조 보간 기울기: 곡선이 실제 값 위아래로 튀지 않는다 */
export function monotoneSlopes(p: Pt[]): number[] {
  const k = p.length;
  if (k < 2) return [0];
  const m: number[] = [];
  for (let i = 0; i < k - 1; i++) m.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
  const t: number[] = new Array(k);
  t[0] = m[0];
  t[k - 1] = m[k - 2];
  for (let i = 1; i < k - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < k - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) {
      const q = 3 / Math.sqrt(s);
      t[i] = q * a * m[i];
      t[i + 1] = q * b * m[i];
    }
  }
  return t;
}

/** p[from..to] 구간의 곡선 경로 (기울기는 전체 구간에서 계산한 것을 쓴다) */
export function curvePath(p: Pt[], t: number[], from = 0, to = p.length - 1): string {
  if (to < from) return "";
  let d = `M${f(p[from][0])} ${f(p[from][1])}`;
  for (let i = from; i < to; i++) {
    const dx = (p[i + 1][0] - p[i][0]) / 3;
    d += ` C${f(p[i][0] + dx)} ${f(p[i][1] + t[i] * dx)} ${f(p[i + 1][0] - dx)} ${f(p[i + 1][1] - t[i + 1] * dx)} ${f(p[i + 1][0])} ${f(p[i + 1][1])}`;
  }
  return d;
}

/** 값이 이어지는 구간들 [시작, 끝] (null은 끊김) */
export function runs(values: (number | null)[]): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  values.forEach((v, i) => {
    if (v != null && start < 0) start = i;
    if (v == null && start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, values.length - 1]);
  return out;
}

/**
 * 시계열 → 실선(확정)·점선(집계 중)·영역 경로.
 * partialFrom 이후 인덱스는 점선, 확정 구간과 한 점을 겹쳐 이어 준다.
 */
export function seriesPaths(
  values: (number | null)[],
  x: (i: number) => number,
  y: (v: number) => number,
  baseY: number,
  partialFrom: number,
): { solid: string; dashed: string; area: string } {
  let solid = "", dashed = "", area = "";
  for (const [a, b] of runs(values)) {
    const idx = Array.from({ length: b - a + 1 }, (_, k) => a + k);
    const p: Pt[] = idx.map((i) => [x(i), y(values[i] as number)]);
    if (p.length === 1) {
      // 단독 점: 짧은 가로선으로 표시
      const seg = `M${f(p[0][0] - 3)} ${f(p[0][1])} H${f(p[0][0] + 3)} `;
      if (a >= partialFrom) dashed += seg;
      else solid += seg;
      continue;
    }
    const t = monotoneSlopes(p);
    const cut = partialFrom - a; // p 안에서 점선 시작 위치
    if (cut > 0) solid += curvePath(p, t, 0, Math.min(cut, p.length - 1)) + " ";
    if (cut < p.length - 1) dashed += curvePath(p, t, Math.max(cut, 0), p.length - 1) + " ";
    area += `${curvePath(p, t)} L${f(p[p.length - 1][0])} ${f(baseY)} L${f(p[0][0])} ${f(baseY)} Z `;
  }
  return { solid: solid.trim(), dashed: dashed.trim(), area: area.trim() };
}

/** 세로 위치: 눈금 범위 [ticks[0], ticks.at(-1)]를 위 여백 top, 아래 여백 bottom을 뺀 높이에 맞춘다 */
export function linearY(ticks: number[], top: number, height: number, bottom: number): (v: number) => number {
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  return (v: number) => top + (height - top - bottom) * (1 - (v - lo) / (hi - lo));
}

/** 보기 좋은 눈금 (1·2·5 × 10^n 간격) */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const rough = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/**
 * 축 태그처럼 세로로 겹치면 안 되는 라벨들의 y를 최소 간격 gap으로 벌린다.
 * 순서는 유지하고, [lo, hi] 밖으로 밀려나면 반대쪽으로 다시 민다.
 */
export function spreadLabels(ys: number[], gap: number, lo: number, hi: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const pos = order.map((o) => o.y);
  for (let k = 0; k < pos.length; k++) pos[k] = Math.max(pos[k], k === 0 ? lo : pos[k - 1] + gap);
  for (let k = pos.length - 1; k >= 0; k--) pos[k] = Math.min(pos[k], k === pos.length - 1 ? hi : pos[k + 1] - gap);
  const out = new Array<number>(ys.length);
  order.forEach((o, k) => (out[o.i] = pos[k]));
  return out;
}

/** 지수: 첫 거래 3개월 평균 = 100. 한 달짜리 기준은 그달 거래 구성에 따라 흔들린다. */
export function toIndex(values: (number | null)[]): (number | null)[] {
  const first = values.filter((v): v is number => v != null).slice(0, 3);
  const base = first.length ? first.reduce((a, b) => a + b, 0) / first.length : 0;
  return values.map((v) => (v == null || !base ? null : (v / base) * 100));
}

/** 둥근 윗모서리 막대 경로 */
export function barPath(x: number, w: number, top: number, base: number, radius = 2): string {
  if (base - top < 0.5) return "";
  const r = Math.min(radius, w / 2, (base - top) / 2);
  return `M${f(x)} ${f(base)} V${f(top + r)} Q${f(x)} ${f(top)} ${f(x + r)} ${f(top)} H${f(x + w - r)} Q${f(x + w)} ${f(top)} ${f(x + w)} ${f(top + r)} V${f(base)} Z `;
}

// ---------- 시간축 ----------

export interface TimeScale {
  n: number;
  X: (i: number) => number;
  slot: number; // 점 사이 간격(px)
  xTicks: { i: number; label: string }[];
  jans: number[]; // 1월(새해) 시작 인덱스: 연도 구분선
  yearLabels: { i: number; label: string }[];
}

/**
 * 시간축 공통: n개 점을 [L0, w−R0]에 고르게 놓고, 달이 바뀌는 점(starts)에 눈금·연도 표시.
 * 눈금 간격은 1·3·6·12개월 중 라벨 사이가 44px 이상인 것, 첫 연도 라벨은 다음 1월 라벨과 겹치지 않을 때만.
 * ym(i) = i번째 점의 YYYYMM, perMonth = 한 달에 든 점 수 (월 1, 주 약 4.35).
 */
function scale(n: number, w: number, L0: number, R0: number, starts: number[], ym: (i: number) => string, perMonth: number): TimeScale {
  const IW = Math.max(1, w - L0 - R0);
  const X = (i: number) => (n === 1 ? L0 + IW / 2 : L0 + (IW * i) / (n - 1));
  const slot = n > 1 ? IW / (n - 1) : IW;
  const month = (i: number) => Number(ym(i).slice(4));
  const every = [1, 3, 6, 12].find((m) => slot * perMonth * m >= 44) ?? 12;
  const xTicks = starts
    .filter((i) => (month(i) - 1) % every === 0)
    .map((i) => ({ i, label: every >= 6 ? `${ym(i).slice(2, 4)}.${ym(i).slice(4)}` : `${month(i)}월` }));
  const jans = starts.filter((i) => month(i) === 1 && i > 0);
  const yearLabels = [...(jans.length === 0 || X(jans[0]) - X(0) >= 48 ? [0] : []), ...jans].map((i) => ({ i, label: ym(i).slice(0, 4) }));
  return { n, X, slot, xTicks, jans, yearLabels };
}

/** 월 단위 시간축. months = YYYYMM 오름차순 (빈 달 없이) */
export function timeScale(months: string[], w: number, L0: number, R0: number): TimeScale {
  return scale(months.length, w, L0, R0, months.map((_, i) => i), (i) => months[i], 1);
}

/**
 * 주 단위 시간축 (주간 지수). weeks = 월요일 날짜(YYYY-MM-DD) 오름차순.
 * 눈금·연도 구분은 각 달의 첫 주에 (첫 주는 이전 주가 없으니 제외: 달 중간에서 시작할 수 있다).
 */
export function weekScale(weeks: string[], w: number, L0: number, R0: number): TimeScale {
  const ym = (i: number) => weeks[i].slice(0, 4) + weeks[i].slice(5, 7);
  const firsts = weeks.map((_, i) => i).filter((i) => i > 0 && ym(i) !== ym(i - 1));
  return scale(weeks.length, w, L0, R0, firsts, ym, 4.35);
}

/** 직전 값 대비 변동률(%). 앞 값이 없으면 null */
export function changePct(values: (number | null)[], i: number, back = 1): number | null {
  const a = values[i], b = values[i - back];
  return a == null || b == null || i - back < 0 || b === 0 ? null : (a / b - 1) * 100;
}

/** 첫 값 = 100 으로 다시 맞춘 지수 (기간 시작 대비 상대 변화) */
export function rebase(values: (number | null)[]): (number | null)[] {
  const base = values.find((v): v is number => v != null);
  return values.map((v) => (v == null || !base ? null : (v / base) * 100));
}

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

/** 둥근 윗모서리 막대 경로 */
export function barPath(x: number, w: number, top: number, base: number, radius = 2): string {
  if (base - top < 0.5) return "";
  const r = Math.min(radius, w / 2, (base - top) / 2);
  return `M${f(x)} ${f(base)} V${f(top + r)} Q${f(x)} ${f(top)} ${f(x + r)} ${f(top)} H${f(x + w - r)} Q${f(x + w)} ${f(top)} ${f(x + w)} ${f(top + r)} V${f(base)} Z `;
}

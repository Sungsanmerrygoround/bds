// 조회 기간(YYYYMM) 계산. URL: ?range=1y 또는 ?from=202301&to=202609

export const RANGE_PRESETS = [
  { key: "6m", label: "6개월", months: 6 },
  { key: "1y", label: "1년", months: 12 },
  { key: "2y", label: "2년", months: 24 },
  { key: "3y", label: "3년", months: 36 },
] as const;
export const DEFAULT_RANGE = "3y";

export interface MonthRange {
  from: string;
  to: string;
  /** 프리셋 key 또는 'custom' */
  key: string;
}

/** KST 기준 이번 달 YYYYMM */
export function currentYm(now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(ym: string, n: number): string {
  const idx = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(4)) - 1 + n;
  return `${Math.floor(idx / 12)}${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** from~to 모든 달 (양 끝 포함) */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let ym = from; ym <= to; ym = addMonths(ym, 1)) out.push(ym);
  return out;
}

const isYm = (v: unknown): v is string =>
  typeof v === "string" && /^\d{6}$/.test(v) && Number(v.slice(4)) >= 1 && Number(v.slice(4)) <= 12;

/** 프리셋 N개월 = 이번 달 포함 N개월. 잘못된 값은 기본(3년)으로. */
export function resolveRange(
  sp: { range?: string | string[]; from?: string | string[]; to?: string | string[] },
  now = new Date(),
): MonthRange {
  const to = currentYm(now);
  if (isYm(sp.from)) {
    const end = isYm(sp.to) && sp.to <= to ? sp.to : to;
    if (sp.from <= end) return { from: sp.from, to: end, key: "custom" };
  }
  const preset = RANGE_PRESETS.find((p) => p.key === sp.range) ?? RANGE_PRESETS.find((p) => p.key === DEFAULT_RANGE)!;
  return { from: addMonths(to, -(preset.months - 1)), to, key: preset.key };
}

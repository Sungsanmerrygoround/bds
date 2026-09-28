/** 만원 → "12.35억" (소수 둘째 자리) */
export function formatEok(man: number | null | undefined): string {
  if (man == null || !Number.isFinite(man)) return "-";
  return `${(man / 10000).toFixed(2)}억`;
}

/** 202607 → "2026.07" */
export function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/** 202607 → "26.07" */
export function shortYm(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/** 202607 → "2026년 7월" */
export function longYm(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

export function formatPct(p: number | null | undefined): string {
  if (p == null) return "-";
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

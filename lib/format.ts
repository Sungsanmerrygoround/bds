/** 만원 → "12.35억" (소수 둘째 자리) */
export function formatEok(man: number | null | undefined): string {
  if (man == null || !Number.isFinite(man)) return "-";
  return `${(man / 10000).toFixed(2)}억`;
}

/** 만원 → "12.35억 원" */
export function formatEokWon(man: number | null | undefined): string {
  return man == null ? "-" : `${formatEok(man)} 원`;
}

/** 202607 → "2026.07" */
export function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

export function formatPct(p: number | null | undefined): string {
  if (p == null) return "-";
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

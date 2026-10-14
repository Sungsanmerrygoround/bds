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

/** 부호를 붙인 변동률 (음수는 수학 기호 −): 1.234 → "+1.2%", -0.5 → "−0.5%", 0 → "0.0%". 값이 없으면 "-" */
export function signedPct(v: number | null | undefined, digits = 1): string {
  if (v == null) return "-";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
}

/** 지표 카드의 변동 표시: 3.21 → "▲ +3.2%", -1 → "▼ −1.0%p" (0은 ▲). 값이 없으면 null */
export function formatDelta(v: number | null, unit = "%"): string | null {
  return v == null ? null : `${v >= 0 ? "▲ +" : "▼ −"}${Math.abs(v).toFixed(1)}${unit}`;
}

/** 변동 방향 → 글자 색 (좋고 나쁨이 아니라 오른 쪽/내린 쪽): 0 이상 up, 음수 down, 없으면 muted */
export function deltaTone(v: number | null): "up" | "down" | "muted" {
  return v == null ? "muted" : v >= 0 ? "up" : "down";
}

/** 세대수 "1,234세대" */
export function formatHouseholds(n: number | null | undefined): string {
  return n == null ? "-" : `${formatCount(n)}세대`;
}

/** 단지 기본정보 한 줄: ["1,234세대", "12개 동", "최고 25층", "2009.03 사용승인", "주차 세대당 1.20대", "지역난방"] */
export function complexFacts(i: {
  households: number | null; dong_count: number | null; top_floor: number | null;
  use_date: string | null; heat_type: string | null; parking: number | null;
}): string[] {
  return [
    i.households ? formatHouseholds(i.households) : null,
    i.dong_count ? `${i.dong_count}개 동` : null,
    i.top_floor ? `최고 ${i.top_floor}층` : null,
    i.use_date ? `${i.use_date.slice(0, 4)}.${i.use_date.slice(5, 7)} 사용승인` : null,
    i.parking && i.households ? `주차 세대당 ${(i.parking / i.households).toFixed(2)}대` : null,
    i.heat_type,
  ].filter((s): s is string => !!s);
}

/** 개수 "1,234" (없으면 "-") */
export function formatCount(n: number | null | undefined): string {
  return n == null ? "-" : n.toLocaleString("ko-KR");
}

/** "2026-09-18" → "26.09.18" */
export const shortDate = (date: string) => date.slice(2).replace(/-/g, ".");

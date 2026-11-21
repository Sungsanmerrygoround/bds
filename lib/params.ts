// URL 검색 파라미터 읽기 (Next의 searchParams 값은 string | string[] | undefined)

type Param = string | string[] | undefined;

/** 값이 문자열 하나일 때만 그 값 */
export const paramStr = (v: Param): string | undefined => (typeof v === "string" ? v : undefined);

/** 선택지 중 URL 값과 같은 것 (없거나 모르는 값이면 undefined → 호출하는 쪽이 기본값을 고른다) */
export function findOption<O extends { value: string }>(options: readonly O[], v: Param): O | undefined {
  return options.find((o) => o.value === v);
}

/** ?g=<그룹 id> → 그룹 (없거나 모르는 값이면 undefined) */
export function findGroup<G extends { id: number }>(groups: G[], v: Param): G | undefined {
  return groups.find((g) => String(g.id) === v);
}

/** 고른 지역 그룹 이름, 고르지 않았으면 '전체 지역' */
export const groupLabel = (g: { name: string } | null | undefined) => g?.name ?? "전체 지역";

/** 지역 필터 선택지: 전체 + 그룹들 */
export const groupOptions = (groups: { id: number; name: string }[]) => [
  { value: "all", label: "전체" },
  ...groups.map((g) => ({ value: String(g.id), label: g.name })),
];

/** 지역 필터의 현재 값 (전체면 "all") */
export const groupValue = (id: number | null | undefined) => (id ? String(id) : "all");

/** 실거래 단지 코드(aptSeq) 형식: "11740-4692" 등. URL·쿠키 값 검사용 */
export const isAptSeq = (s: string) => /^[0-9A-Za-z_-]{1,32}$/.test(s);

/** URL 경로 조각 디코드. 잘못된 % 인코딩이면 null (decodeURIComponent는 던진다) */
export function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** 목록 쪽 번호 파라미터 (?p=2 = 둘째 쪽). 필터를 바꾸면 지운다 */
export const PAGE_PARAM = "p";

/** ?p 값 → 0부터 세는 쪽 번호 (없거나 잘못된 값이면 0) */
export function pageIndex(v: Param): number {
  const n = Number(paramStr(v));
  return Number.isInteger(n) && n >= 1 ? n - 1 : 0;
}

/** 현재 검색 파라미터에서 하나만 바꾼 주소 (값이 null이면 지움) */
export function withParam(path: string, sp: Record<string, Param>, key: string, value: string | null): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (k !== key && typeof v === "string") q.set(k, v);
  if (value != null) q.set(key, value);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

// URL 검색 파라미터 읽기 (Next의 searchParams 값은 string | string[] | undefined)

type Param = string | string[] | undefined;

/** 값이 문자열 하나일 때만 그 값 */
export const paramStr = (v: Param): string | undefined => (typeof v === "string" ? v : undefined);

/** ?g=<그룹 id> → 그룹 (없거나 모르는 값이면 undefined) */
export function findGroup<G extends { id: number }>(groups: G[], v: Param): G | undefined {
  return groups.find((g) => String(g.id) === v);
}

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

// URL 검색 파라미터 읽기 (Next의 searchParams 값은 string | string[] | undefined)

type Param = string | string[] | undefined;

/** 값이 문자열 하나일 때만 그 값 */
export const paramStr = (v: Param): string | undefined => (typeof v === "string" ? v : undefined);

/** ?g=<그룹 id> → 그룹 (없거나 모르는 값이면 undefined) */
export function findGroup<G extends { id: number }>(groups: G[], v: Param): G | undefined {
  return groups.find((g) => String(g.id) === v);
}

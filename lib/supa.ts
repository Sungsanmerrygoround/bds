// Supabase(PostgREST) 응답 공통 처리. 화면 조회(lib/queries)와 수집 스크립트(ingest)가 함께 쓴다.

/** 오류면 던지고, 아니면 data */
export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

const PAGE = 1000; // PostgREST 기본 최대 행 수

/** 1000행 제한을 넘기기 위한 range 페이지네이션: build(from, to)로 끝까지 받는다 */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const rows = check(await build(from, from + PAGE - 1), what) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

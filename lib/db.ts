import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// service role 키는 서버 컴포넌트에서만 쓴다 (클라이언트 번들 금지 = server-only).
// 대시보드는 공개지만 조회만 하고, 쓰기는 수집 스크립트만 한다.
let client: SupabaseClient | undefined;

/**
 * 무료 DB는 캐시가 비면 평소 수십 ms인 조회가 가끔 수 초로 늘고, 8초를 넘으면 statement timeout(57014)으로
 * 화면이 500이 된다. 첫 시도가 캐시를 채워 두므로 그 경우에만 한 번 다시 시도한다 (화면 조회는 모두 읽기).
 */
export async function retryOnTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 500) return res;
  const body = await res.clone().text();
  if (!body.includes('"57014"')) return res;
  console.warn("DB statement timeout, 한 번 다시 시도");
  return fetch(input, init);
}

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다");
    client = createClient(url, key, { auth: { persistSession: false }, global: { fetch: retryOnTimeout } });
  }
  return client;
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// service role 키는 서버 컴포넌트에서만 쓴다 (클라이언트 번들 금지 = server-only).
// 대시보드는 공개지만 조회만 하고, 쓰기는 수집 스크립트만 한다.
let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

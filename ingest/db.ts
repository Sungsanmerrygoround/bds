import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";
import type { Region } from "./normalize";

export function serviceClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** PostgREST 기본 1000행 제한을 넘기기 위한 range 페이지네이션 */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const res = await build(from, from + size - 1);
    const rows = check(res, what) ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

export interface RegionWithMeta extends Region {
  sigungu_name: string;
  is_active: boolean;
}

export async function loadRegions(db: SupabaseClient): Promise<RegionWithMeta[]> {
  const res = await db
    .from("regions")
    .select("id, lawd_cd, sigungu_name, include_dongs, exclude_dongs, supply_address_patterns, is_active")
    .order("sort_order");
  return check(res, "regions 조회") as RegionWithMeta[];
}

export async function getSettingNum(db: SupabaseClient, key: string, fallback: number): Promise<number> {
  const res = await db.from("settings").select("value").eq("key", key).maybeSingle();
  const v = check(res, `settings ${key}`)?.value;
  return typeof v === "number" ? v : fallback;
}

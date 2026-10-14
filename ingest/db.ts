import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { check } from "../lib/supa";
import { requireEnv } from "./env";
import type { Region } from "./normalize";

export { check, selectAll } from "../lib/supa";

export type Db = SupabaseClient;

export function serviceClient(): Db {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export interface RegionWithMeta extends Region {
  sigungu_name: string;
  is_active: boolean;
}

export async function loadRegions(db: Db): Promise<RegionWithMeta[]> {
  const res = await db
    .from("regions")
    .select("id, lawd_cd, sigungu_name, include_dongs, exclude_dongs, supply_address_patterns, is_active")
    .order("sort_order");
  return check(res, "regions 조회") as RegionWithMeta[];
}

export async function getSettingNum(db: Db, key: string, fallback: number): Promise<number> {
  const res = await db.from("settings").select("value").eq("key", key).maybeSingle();
  const v = check(res, `settings ${key}`)?.value;
  return typeof v === "number" ? v : fallback;
}

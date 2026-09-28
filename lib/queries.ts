import "server-only";
import { check, db } from "./db";

export interface RegionGroup {
  id: number;
  name: string;
  regions: { id: number; sigungu_name: string }[];
}

export async function getGroups(): Promise<RegionGroup[]> {
  const res = await db()
    .from("region_groups")
    .select("id, name, regions(id, sigungu_name, sort_order)")
    .order("sort_order");
  return check(res, "region_groups") as RegionGroup[];
}

// ---------- 추이 ----------

export interface TrendRow {
  ym: string;
  trade_median: number | null;
  trade_count: number;
  jeonse_median: number | null;
  jeonse_count: number;
}

export async function getTrend(groupId: number, band: number | null, from: string, to: string): Promise<TrendRow[]> {
  const res = await db().rpc("trend_monthly", { p_group_id: groupId, p_area_band: band, p_from: from, p_to: to });
  return check(res, "trend_monthly") as TrendRow[];
}

// ---------- 이벤트 ----------

export interface EventRow {
  id: number;
  type: "NEW_HIGH" | "DROP";
  apt_seq: string;
  area_type: number;
  deal_date: string;
  price_man: number;
  ref_price_man: number;
  ref_sample_count: number;
  change_pct: number;
  is_direct: boolean;
  detected_at: string;
  invalidated_at: string | null;
  apt_trades: { floor: number | null } | null;
  complexes: { apt_nm: string; umd_nm: string | null; regions: { group_id: number; sigungu_name: string } };
}

export const EVENT_LIMIT = 500;

export async function getEvents(f: {
  type: "NEW_HIGH" | "DROP" | null;
  groupId: number | null;
  minSamples: number;
  includeDirect: boolean;
  includeInvalid: boolean;
  since: string;
}): Promise<EventRow[]> {
  let q = db()
    .from("events")
    .select(
      "id, type, apt_seq, area_type, deal_date, price_man, ref_price_man, ref_sample_count, change_pct, is_direct, detected_at, invalidated_at," +
        " apt_trades(floor), complexes!inner(apt_nm, umd_nm, regions!inner(group_id, sigungu_name))",
    )
    .gte("deal_date", f.since)
    .gte("ref_sample_count", f.minSamples)
    .order("deal_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(EVENT_LIMIT);
  if (f.type) q = q.eq("type", f.type);
  if (f.groupId) q = q.eq("complexes.regions.group_id", f.groupId);
  if (!f.includeDirect) q = q.eq("is_direct", false);
  if (!f.includeInvalid) q = q.is("invalidated_at", null);
  return check(await q, "events") as unknown as EventRow[];
}

// ---------- 단지 ----------

export interface ComplexSearchRow {
  apt_seq: string;
  apt_nm: string;
  umd_nm: string | null;
  build_year: number | null;
  sigungu_name: string;
  trades_12m: number;
  last_deal_date: string | null;
}

export async function searchComplexes(q: string, groupId: number | null): Promise<ComplexSearchRow[]> {
  const res = await db().rpc("complex_search", { p_q: q, p_group_id: groupId, p_limit: 100 });
  return check(res, "complex_search") as ComplexSearchRow[];
}

export interface Complex {
  apt_seq: string;
  apt_nm: string;
  umd_nm: string | null;
  jibun: string | null;
  road_nm: string | null;
  build_year: number | null;
  regions: { sigungu_name: string; group_id: number };
}

export async function getComplex(aptSeq: string): Promise<Complex | null> {
  const res = await db()
    .from("complexes")
    .select("apt_seq, apt_nm, umd_nm, jibun, road_nm, build_year, regions(sigungu_name, group_id)")
    .eq("apt_seq", aptSeq)
    .maybeSingle();
  return check(res, "complexes") as Complex | null;
}

export interface ComplexTrade {
  id: number;
  deal_date: string;
  price_man: number;
  area_type: number;
  floor: number | null;
  apt_dong: string | null;
  is_direct: boolean;
  is_cancelled: boolean;
  missing_since: string | null;
  events: { type: "NEW_HIGH" | "DROP"; change_pct: number; invalidated_at: string | null }[];
}

export interface ComplexRent {
  id: number;
  deal_date: string;
  deposit_man: number;
  monthly_rent_man: number;
  rent_type: "전세" | "월세";
  area_type: number;
  floor: number | null;
  contract_type: string | null;
  use_rr_right: boolean | null;
}

/** 단지 거래는 수백~수천 건이라 range로 끝까지 받는다 */
async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = (check(await build(from, from + 999), what) ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function getComplexTrades(aptSeq: string, from: string, to: string): Promise<ComplexTrade[]> {
  return all<ComplexTrade>(
    (a, b) =>
      db()
        .from("apt_trades")
        .select("id, deal_date, price_man, area_type, floor, apt_dong, is_direct, is_cancelled, missing_since, events(type, change_pct, invalidated_at)")
        .eq("apt_seq", aptSeq)
        .gte("deal_ymd", from)
        .lte("deal_ymd", to)
        .order("deal_date", { ascending: false })
        .order("id", { ascending: false })
        .range(a, b),
    "apt_trades",
  );
}

export async function getComplexRents(aptSeq: string, from: string, to: string): Promise<ComplexRent[]> {
  return all<ComplexRent>(
    (a, b) =>
      db()
        .from("apt_rents")
        .select("id, deal_date, deposit_man, monthly_rent_man, rent_type, area_type, floor, contract_type, use_rr_right")
        .eq("apt_seq", aptSeq)
        .is("missing_since", null)
        .gte("deal_ymd", from)
        .lte("deal_ymd", to)
        .order("deal_date", { ascending: false })
        .order("id", { ascending: false })
        .range(a, b),
    "apt_rents",
  );
}

// ---------- 입주 물량 ----------

export interface SupplyProject {
  house_manage_no: string;
  house_nm: string;
  address: string;
  region_id: number;
  households: number;
  total_households_override: number | null;
  move_in_ym: string;
  announce_date: string | null;
  pblanc_url: string | null;
  is_excluded: boolean;
  exclude_reason: string | null;
  house_secd_nm: string | null;
  rent_secd_nm: string | null;
}

export interface ManualSupply {
  id: number;
  region_id: number;
  name: string;
  ym: string;
  households: number;
  kind: "입주" | "이주";
  note: string | null;
}

export async function getSupply(from: string, to: string): Promise<{ projects: SupplyProject[]; manual: ManualSupply[] }> {
  const [p, m] = await Promise.all([
    db()
      .from("supply_projects")
      .select("house_manage_no, house_nm, address, region_id, households, total_households_override, move_in_ym, announce_date, pblanc_url, is_excluded, exclude_reason, house_secd_nm, rent_secd_nm")
      .gte("move_in_ym", from)
      .lte("move_in_ym", to)
      .order("move_in_ym"),
    db().from("manual_supply").select("id, region_id, name, ym, households, kind, note").gte("ym", from).lte("ym", to).order("ym"),
  ]);
  return { projects: check(p, "supply_projects") as SupplyProject[], manual: check(m, "manual_supply") as ManualSupply[] };
}

// ---------- 수집 상태 ----------

export async function getLastIngest(): Promise<{ finished_at: string; job: string } | null> {
  const res = await db()
    .from("ingest_runs")
    .select("finished_at, job")
    .eq("status", "ok")
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return check(res, "ingest_runs") as { finished_at: string; job: string } | null;
}

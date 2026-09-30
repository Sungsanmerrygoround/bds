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
    .order("sort_order")
    .order("sort_order", { referencedTable: "regions" });
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
  apt_trades: { floor: number | null; rgst_date: string | null; is_cancelled: boolean } | null;
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
        " apt_trades(floor, rgst_date, is_cancelled), complexes!inner(apt_nm, umd_nm, regions!inner(group_id, sigungu_name))",
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

export interface TickerRow {
  id: number;
  apt_seq: string;
  area_type: number;
  deal_date: string;
  price_man: number;
  change_pct: number;
  complexes: { apt_nm: string };
}

/** 상단 티커: 유효한 최근 신고가 (비교 거래 3건 이상, 직거래 제외) */
export async function getTicker(limit = 12): Promise<TickerRow[]> {
  const res = await db()
    .from("events")
    .select("id, apt_seq, area_type, deal_date, price_man, change_pct, complexes!inner(apt_nm)")
    .eq("type", "NEW_HIGH")
    .is("invalidated_at", null)
    .eq("is_direct", false)
    .gte("ref_sample_count", 3)
    .order("deal_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  return check(res, "ticker") as unknown as TickerRow[];
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
  area_band: number | null; // DB 면적 구간(원래 전용면적 기준) — 추이·순위와 같은 기준
  floor: number | null;
  apt_dong: string | null;
  is_direct: boolean;
  is_cancelled: boolean;
  missing_since: string | null;
  rgst_date: string | null;
  events: { type: "NEW_HIGH" | "DROP"; change_pct: number; invalidated_at: string | null }[];
}

export interface ComplexRent {
  id: number;
  deal_date: string;
  deposit_man: number;
  monthly_rent_man: number;
  rent_type: "전세" | "월세";
  area_type: number;
  area_band: number | null;
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
        .select("id, deal_date, price_man, area_type, area_band, floor, apt_dong, is_direct, is_cancelled, missing_since, rgst_date, events(type, change_pct, invalidated_at)")
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
        .select("id, deal_date, deposit_man, monthly_rent_man, rent_type, area_type, area_band, floor, contract_type, use_rr_right")
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

/** 여러 단지 기본 정보 (단지 비교용) */
export async function getComplexes(aptSeqs: string[]): Promise<Complex[]> {
  if (aptSeqs.length === 0) return [];
  const res = await db()
    .from("complexes")
    .select("apt_seq, apt_nm, umd_nm, jibun, road_nm, build_year, regions(sigungu_name, group_id)")
    .in("apt_seq", aptSeqs);
  return check(res, "complexes") as unknown as Complex[];
}

export interface ComplexStats {
  apt_seq: string;
  apt_nm: string;
  umd_nm: string | null;
  sigungu_name: string;
  build_year: number | null;
  area_type: number | null;
  trades_12m: number | null;
  last_date: string | null;
  last_price: number | null;
  trade_median_6m: number | null;
  trade_count_6m: number | null;
  jeonse_median_6m: number | null;
  jeonse_count_6m: number | null;
  peak_price: number | null;
  peak_date: string | null;
  event_type: "NEW_HIGH" | "DROP" | null;
  event_date: string | null;
  event_pct: number | null;
}

/** 관심 단지 요약: 단지마다 최근 2년 거래가 가장 많은 전용면적 기준 */
export async function getComplexStats(aptSeqs: string[]): Promise<ComplexStats[]> {
  if (aptSeqs.length === 0) return [];
  const res = await db().rpc("complex_stats", { p_apt_seqs: aptSeqs });
  return check(res, "complex_stats") as ComplexStats[];
}

// ---------- 단지 순위 ----------

export interface RankRow {
  apt_seq: string;
  apt_nm: string;
  umd_nm: string | null;
  sigungu_name: string;
  build_year: number | null;
  trades_12m: number;
  median_12m: number;
  ppa_12m: number; // 3.3㎡당 만원
  recent_median: number | null;
  recent_count: number;
  year_ago_median: number | null;
  year_ago_count: number;
  peak_price: number;
  peak_date: string;
}

export async function getRank(groupId: number | null, band: number | null, end: string): Promise<RankRow[]> {
  const res = await db().rpc("complex_rank", { p_group_id: groupId, p_area_band: band, p_end: end });
  return check(res, "complex_rank") as RankRow[];
}

// ---------- 전세 갱신 ----------

export interface RenewalRow {
  ym: string;
  new_count: number;
  renew_count: number;
  rr_count: number;
  jeonse_renew_count: number;
  change_median: number | null; // %, 전세→전세 갱신 전체
  down_count: number;
  up_count: number;
  free_count: number; // 갱신요구권 없이 합의한 전세 갱신
  free_change_median: number | null;
  rr_jeonse_count: number; // 갱신요구권 쓴 전세 갱신 (인상 상한 5%)
  rr_change_median: number | null;
}

export async function getRenewal(groupId: number | null, band: number | null, from: string, to: string): Promise<RenewalRow[]> {
  const res = await db().rpc("renewal_monthly", { p_group_id: groupId, p_area_band: band, p_from: from, p_to: to });
  const num = (v: unknown) => (v == null ? null : Number(v)); // numeric은 문자열로 온다
  return (check(res, "renewal_monthly") as RenewalRow[]).map((r) => ({
    ...r,
    change_median: num(r.change_median),
    free_change_median: num(r.free_change_median),
    rr_change_median: num(r.rr_change_median),
  }));
}

export interface RenewalDrop {
  id: number;
  apt_seq: string;
  apt_nm: string;
  umd_nm: string | null;
  sigungu_name: string;
  area_type: number;
  floor: number | null;
  deal_date: string;
  deposit_man: number;
  pre_deposit_man: number;
  change_pct: number;
  use_rr_right: boolean | null;
}

export async function getRenewalDrops(groupId: number | null, band: number | null, since: string, limit = 50): Promise<RenewalDrop[]> {
  const res = await db().rpc("renewal_drops", { p_group_id: groupId, p_area_band: band, p_since: since, p_limit: limit });
  return check(res, "renewal_drops") as RenewalDrop[];
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

// 매일 아침 수집하므로 30시간 넘게 성공 기록이 없으면 지연으로 본다
const STALE_MS = 30 * 3600_000;

export async function getIngestStatus(): Promise<{ finishedAt: string | null; stale: boolean }> {
  const last = await getLastIngest().catch(() => null);
  return {
    finishedAt: last?.finished_at ?? null,
    stale: !last || Date.now() - new Date(last.finished_at).getTime() > STALE_MS,
  };
}

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

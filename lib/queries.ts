// 화면용 DB 조회 (서버 전용). numeric 열은 PostgREST가 JSON 숫자로 주므로 그대로 number로 쓴다
// (마이그레이션 테스트의 PGlite는 numeric을 문자열로 주지만 화면 조회와는 관계없다).
import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { db } from "./db";
import { check, selectAll } from "./supa";

/**
 * 조회 결과 캐시. 데이터는 하루 한 번 수집되므로 결과를 Vercel 데이터 캐시에 두고(배포가 바뀌어도 유지),
 * 수집이 끝나면 /api/revalidate가 DATA_TAG를 비운다. 그 호출이 없어도 REVALIDATE_S가 지나면
 * 다음 요청이 이전 결과를 바로 받고 뒤에서 새로 조회한다. 오류(던짐)는 캐시하지 않는다.
 * 인자는 JSON으로 캐시 키가 되고, 결과도 JSON으로 저장되므로 Map·Date를 돌려주면 안 된다.
 */
export const DATA_TAG = "bds-data";
const REVALIDATE_S = 3600;

function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return unstable_cache(fn, ["q", name], { tags: [DATA_TAG], revalidate: REVALIDATE_S });
}

export interface RegionGroup {
  id: number;
  name: string;
  regions: { id: number; sigungu_name: string }[];
}

export const getGroups = cached("getGroups", async (): Promise<RegionGroup[]> => {
  const res = await db()
    .from("region_groups")
    .select("id, name, regions(id, sigungu_name, sort_order)")
    .order("sort_order")
    .order("sort_order", { referencedTable: "regions" });
  return check(res, "region_groups") as RegionGroup[];
});

// ---------- 추이 ----------

export interface TrendRow {
  ym: string;
  trade_median: number | null;
  trade_count: number;
  jeonse_median: number | null;
  jeonse_count: number;
}

/** 전세 중위가 기준: new = 갱신 계약 제외(지금 새로 계약하는 시세), all = 갱신 포함 전체 */
export type JeonseBasis = "new" | "all";

/** jeonse_median·jeonse_count는 고른 기준의 값 (기본: 갱신 제외) */
export const getTrend = cached("getTrend", async (groupId: number, band: number | null, from: string, to: string, jeonse: JeonseBasis = "new"): Promise<TrendRow[]> => {
  const res = await db().rpc("trend_monthly", { p_group_id: groupId, p_area_band: band, p_from: from, p_to: to });
  const rows = check(res, "trend_monthly") as (TrendRow & { jeonse_new_median: number | null; jeonse_new_count: number })[];
  return rows.map(({ jeonse_new_median, jeonse_new_count, ...r }) =>
    jeonse === "new" ? { ...r, jeonse_median: jeonse_new_median, jeonse_count: jeonse_new_count } : r);
});

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

/** 신고가·하락 화면 한 쪽에 보여 줄 건수 */
export const EVENT_PAGE = 200;

export interface EventFilter {
  type: "NEW_HIGH" | "DROP" | null;
  groupId: number | null;
  minSamples: number;
  includeDirect: boolean;
  includeInvalid: boolean;
  since: string;
}

/** 조건에 맞는 이벤트 조회 (select에 complexes!inner(regions!inner(group_id))가 있어야 지역 조건이 걸린다) */
function eventQuery(select: string, f: EventFilter, count?: "exact") {
  let q = db().from("events").select(select, count ? { count, head: true } : undefined)
    .gte("deal_date", f.since)
    .gte("ref_sample_count", f.minSamples);
  if (f.type) q = q.eq("type", f.type);
  if (f.groupId) q = q.eq("complexes.regions.group_id", f.groupId);
  if (!f.includeDirect) q = q.eq("is_direct", false);
  if (!f.includeInvalid) q = q.is("invalidated_at", null);
  return q;
}

/** page(0부터)번째 쪽의 이벤트, 계약일 최신순 */
export const getEvents = cached("getEvents", async (f: EventFilter, page: number): Promise<EventRow[]> => {
  const q = eventQuery(
    "id, type, apt_seq, area_type, deal_date, price_man, ref_price_man, ref_sample_count, change_pct, is_direct, detected_at, invalidated_at," +
      " apt_trades(floor, rgst_date, is_cancelled), complexes!inner(apt_nm, umd_nm, regions!inner(group_id, sigungu_name))",
    f,
  )
    .order("deal_date", { ascending: false })
    .order("id", { ascending: false })
    .range(page * EVENT_PAGE, (page + 1) * EVENT_PAGE - 1);
  return check(await q, "events") as unknown as EventRow[];
});

const COUNT_SELECT = "id, complexes!inner(regions!inner(group_id))";

async function countOf(q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string): Promise<number> {
  const res = await q;
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.count ?? 0;
}

/**
 * 조건에 맞는 전체 건수 (쪽 나눔과 관계없이): 신고가·하락, 그리고 미등기
 * (unregBefore보다 앞선 계약 중 등기 정보 없고 해제되지 않은 거래 — lib/stats isUnregistered와 같은 기준).
 */
export const getEventCounts = cached("getEventCounts", async (f: EventFilter, unregBefore: string): Promise<{ highs: number; drops: number; unreg: number }> => {
  const [highs, drops, unreg] = await Promise.all([
    f.type === "DROP" ? 0 : countOf(eventQuery(COUNT_SELECT, { ...f, type: "NEW_HIGH" }, "exact"), "events count"),
    f.type === "NEW_HIGH" ? 0 : countOf(eventQuery(COUNT_SELECT, { ...f, type: "DROP" }, "exact"), "events count"),
    countOf(
      eventQuery(`${COUNT_SELECT}, apt_trades!inner(rgst_date, is_cancelled)`, f, "exact")
        .lt("deal_date", unregBefore)
        .is("apt_trades.rgst_date", null)
        .eq("apt_trades.is_cancelled", false),
      "events unreg count",
    ),
  ]);
  return { highs, drops, unreg };
});

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
export const getTicker = cached("getTicker", async (limit: number = 12): Promise<TickerRow[]> => {
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
});

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

export const searchComplexes = cached("searchComplexes", async (q: string, groupId: number | null): Promise<ComplexSearchRow[]> => {
  const res = await db().rpc("complex_search", { p_q: q, p_group_id: groupId, p_limit: 100 });
  return check(res, "complex_search") as ComplexSearchRow[];
});

export interface Complex {
  apt_seq: string;
  apt_nm: string;
  umd_nm: string | null;
  jibun: string | null;
  road_nm: string | null;
  build_year: number | null;
  regions: { sigungu_name: string; group_id: number };
}

const COMPLEX_COLUMNS = "apt_seq, apt_nm, umd_nm, jibun, road_nm, build_year, regions(sigungu_name, group_id)";

/** 화면과 탭 제목(generateMetadata)이 함께 부르므로 한 요청 안에서는 한 번만 조회 */
export const getComplex = cache(cached("getComplex", async (aptSeq: string): Promise<Complex | null> => {
  const res = await db()
    .from("complexes")
    .select(COMPLEX_COLUMNS)
    .eq("apt_seq", aptSeq)
    .maybeSingle();
  return check(res, "complexes") as Complex | null;
}));

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
export const getComplexTrades = cached("getComplexTrades", async (aptSeq: string, from: string, to: string): Promise<ComplexTrade[]> => {
  return selectAll<ComplexTrade>(
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
});

export const getComplexRents = cached("getComplexRents", async (aptSeq: string, from: string, to: string): Promise<ComplexRent[]> => {
  return selectAll<ComplexRent>(
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
});

/** 여러 단지 기본 정보 (단지 비교용) */
export const getComplexes = cached("getComplexes", async (aptSeqs: string[]): Promise<Complex[]> => {
  if (aptSeqs.length === 0) return [];
  const res = await db().from("complexes").select(COMPLEX_COLUMNS).in("apt_seq", aptSeqs);
  return check(res, "complexes") as unknown as Complex[];
});

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
  jeonse_median_6m: number | null; // 갱신 포함 전체
  jeonse_count_6m: number | null;
  jeonse_new_median_6m: number | null; // 갱신 제외
  jeonse_new_count_6m: number | null;
  peak_price: number | null;
  peak_date: string | null;
  event_type: "NEW_HIGH" | "DROP" | null;
  event_date: string | null;
  event_pct: number | null;
}

/** 관심 단지 요약: 단지마다 최근 2년 거래가 가장 많은 전용면적 기준 */
export const getComplexStats = cached("getComplexStats", async (aptSeqs: string[]): Promise<ComplexStats[]> => {
  if (aptSeqs.length === 0) return [];
  const res = await db().rpc("complex_stats", { p_apt_seqs: aptSeqs });
  return check(res, "complex_stats") as ComplexStats[];
});

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
  households: number | null; // K-apt 세대수 (짝 없는 단지는 null)
  trades_all_12m: number; // 면적 구간과 관계없이 단지 전체 12개월 매매 (회전율용)
  jeonse_median_12m: number | null; // 같은 면적 구간 12개월 전세 중위 (갱신 제외)
  jeonse_count_12m: number;
}

export const getRank = cached("getRank", async (groupId: number | null, band: number | null, end: string): Promise<RankRow[]> => {
  const res = await db().rpc("complex_rank", { p_group_id: groupId, p_area_band: band, p_end: end });
  return check(res, "complex_rank") as RankRow[];
});

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

export const getRenewal = cached("getRenewal", async (groupId: number | null, band: number | null, from: string, to: string): Promise<RenewalRow[]> => {
  const res = await db().rpc("renewal_monthly", { p_group_id: groupId, p_area_band: band, p_from: from, p_to: to });
  return check(res, "renewal_monthly") as RenewalRow[];
});

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

export const getRenewalDrops = cached("getRenewalDrops", async (groupId: number | null, band: number | null, since: string, limit: number = 50): Promise<RenewalDrop[]> => {
  const res = await db().rpc("renewal_drops", { p_group_id: groupId, p_area_band: band, p_since: since, p_limit: limit });
  return check(res, "renewal_drops") as RenewalDrop[];
});

// ---------- 월세 ----------

export interface RentMonthlyRow {
  ym: string;
  jeonse_count: number;
  wolse_count: number;
  jeonse_new_count: number; // 갱신 제외
  wolse_new_count: number;
  wolse_deposit_median: number | null; // 갱신 제외 월세의 보증금 중위
  wolse_rent_median: number | null;
  conv_rate_median: number | null; // 전월세 전환율(%) 중위
  conv_count: number; // 전환율을 계산할 수 있었던 계약 수
}

export const getRentMonthly = cached("getRentMonthly", async (groupId: number | null, band: number | null, from: string, to: string): Promise<RentMonthlyRow[]> => {
  const res = await db().rpc("rent_monthly", { p_group_id: groupId, p_area_band: band, p_from: from, p_to: to });
  return check(res, "rent_monthly") as RentMonthlyRow[];
});

// ---------- 새로 신고된 거래 ----------

interface NewDeal {
  id: number;
  first_seen_at: string;
  apt_seq: string;
  apt_nm: string;
  umd_nm: string | null;
  sigungu_name: string;
  area_type: number;
  floor: number | null;
  deal_date: string;
}

export interface NewTrade extends NewDeal {
  price_man: number;
  is_direct: boolean;
  is_cancelled: boolean;
  prev_price: number | null; // 같은 단지·면적의 직전 유효 거래
  prev_date: string | null;
  event_type: "NEW_HIGH" | "DROP" | null;
  event_pct: number | null;
}

export interface NewRent extends NewDeal {
  deposit_man: number;
  monthly_rent_man: number;
  contract_type: string | null;
  use_rr_right: boolean | null;
  pre_deposit_man: number | null;
  pre_monthly_rent_man: number | null;
}

export const NEW_DEAL_LIMIT = 500;

/** since(ISO 시각) 이후 수집에서 처음 본 매매, 최근 수집 순. aptSeqs를 주면 그 단지들만 (관심 단지) */
export const getNewTrades = cached("getNewTrades", async (since: string, groupId: number | null, aptSeqs?: string[]): Promise<NewTrade[]> => {
  const res = await db().rpc("new_trades", { p_since: since, p_group_id: groupId, p_limit: NEW_DEAL_LIMIT, p_apt_seqs: aptSeqs ?? null });
  return check(res, "new_trades") as NewTrade[];
});

export const getNewRents = cached("getNewRents", async (since: string, groupId: number | null, aptSeqs?: string[]): Promise<NewRent[]> => {
  const res = await db().rpc("new_rents", { p_since: since, p_group_id: groupId, p_limit: NEW_DEAL_LIMIT, p_apt_seqs: aptSeqs ?? null });
  return check(res, "new_rents") as NewRent[];
});

// ---------- 해제된 거래 ----------

export interface CancelledTrade {
  id: number;
  apt_seq: string;
  apt_nm: string;
  umd_nm: string | null;
  sigungu_name: string;
  area_type: number;
  floor: number | null;
  deal_date: string;
  cancel_date: string;
  price_man: number;
  is_direct: boolean;
  prev_max: number | null; // 계약일 직전 36개월 유효 거래 최고가
  prev_count: number;
  later_count: number; // 계약일 뒤 ~ 해제일 사이 같은 단지·면적 유효 거래
  later_max: number | null;
}

export const CANCELLED_LIMIT = 1000;

/** since(YYYY-MM-DD) 이후 해제된 매매, 최근 해제 순 */
export const getCancelledTrades = cached("getCancelledTrades", async (groupId: number | null, since: string): Promise<CancelledTrade[]> => {
  const res = await db().rpc("cancelled_trades", { p_group_id: groupId, p_since: since, p_limit: CANCELLED_LIMIT });
  return check(res, "cancelled_trades") as CancelledTrade[];
});

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

export const getSupply = cached("getSupply", async (from: string, to: string): Promise<{ projects: SupplyProject[]; manual: ManualSupply[] }> => {
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
});

// ---------- 단지 기본정보 (K-apt) ----------

export interface ComplexInfo {
  apt_seq: string;
  kapt_name: string | null;
  households: number | null;
  dong_count: number | null;
  top_floor: number | null;
  use_date: string | null;
  heat_type: string | null;
  parking: number | null;
}

/** 짝지은 K-apt 정보. 의무관리 대상이 아닌 소규모 단지 등은 결과에 없다. */
export async function getComplexInfo(aptSeqs: string[]): Promise<Map<string, ComplexInfo>> {
  if (aptSeqs.length === 0) return new Map();
  return new Map((await getComplexInfoRows(aptSeqs)).map((r) => [r.apt_seq, r]));
}

// 캐시는 JSON으로 저장되므로 Map이 아니라 행 배열을 캐시한다
const getComplexInfoRows = cached("getComplexInfoRows", async (aptSeqs: string[]): Promise<ComplexInfo[]> => {
  const res = await db()
    .from("complex_info")
    .select("apt_seq, kapt_name, households, dong_count, top_floor, use_date, heat_type, parking")
    .in("apt_seq", aptSeqs);
  return check(res, "complex_info") as ComplexInfo[];
});

// ---------- 금리 (전국, 월별) ----------

export interface RateRow {
  series: "base" | "mortgage";
  ym: string;
  value: number;
}

export const getRates = cached("getRates", async (from: string, to: string): Promise<RateRow[]> => {
  const res = await db().from("rates_monthly").select("series, ym, value").gte("ym", from).lte("ym", to).order("ym");
  return check(res, "rates_monthly") as RateRow[];
});

// ---------- 부동산원 주간 지수 (시군구) ----------

export interface WeeklyIndexRow {
  region_id: number;
  kind: "sale" | "jeonse";
  week_date: string;
  value: number;
}

/** from·to는 YYYY-MM-DD. 여러 구 × 2종 × 5년이면 천 행이 넘어 나눠 받는다. */
export const getWeeklyIndex = cached("getWeeklyIndex", async (regionIds: number[], kinds: ("sale" | "jeonse")[], from: string, to: string): Promise<WeeklyIndexRow[]> => {
  return selectAll<WeeklyIndexRow>(
    (a, b) =>
      db()
        .from("price_index_weekly")
        .select("region_id, kind, week_date, value")
        .in("region_id", regionIds)
        .in("kind", kinds)
        .gte("week_date", from)
        .lte("week_date", to)
        .order("week_date")
        .order("region_id")
        .order("kind")
        .range(a, b),
    "price_index_weekly",
  );
});

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

const getLastIngest = cached("getLastIngest", async (): Promise<{ finished_at: string; job: string } | null> => {
  const res = await db()
    .from("ingest_runs")
    .select("finished_at, job")
    .eq("status", "ok")
    .in("source", ["trade", "rent"]) // 금리·지수 수집이 실거래 수집 지연을 가리지 않게
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return check(res, "ingest_runs") as { finished_at: string; job: string } | null;
});

// npm run ingest -- check : 수집은 성공했는데 데이터가 이상한지 점검 (매일 수집 뒤 워크플로가 실행).
// 이상이 있어도 실패로 끝내지 않는다(사용자 결정: 경보 메일 없음) — GitHub Actions 실행 화면에 경고 주석만 남긴다.
// DB에는 아무것도 쓰지 않는다.
import { todayKst } from "../../lib/range";
import { checkMonths, findAnomalies, KINDS, monthlyKey, type CheckInput } from "../check";
import { check, loadRegions, serviceClient, type Db } from "../db";

const TABLE = { trade: "apt_trades", rent: "apt_rents" } as const;

async function countMonth(db: Db, kind: keyof typeof TABLE, lawd: string, ym: string): Promise<number> {
  const res = await db.from(TABLE[kind]).select("id", { count: "exact", head: true })
    .eq("lawd_cd", lawd).eq("deal_ymd", ym).is("missing_since", null);
  if (res.error) throw new Error(`${TABLE[kind]} 건수: ${res.error.message}`);
  return res.count ?? 0;
}

async function gather(db: Db, today: string): Promise<CheckInput> {
  const regions = (await loadRegions(db)).filter((r) => r.is_active);
  const regionNames = new Map<string, string>();
  for (const r of regions) regionNames.set(r.lawd_cd, regionNames.has(r.lawd_cd) ? `${regionNames.get(r.lawd_cd)}·${r.sigungu_name}` : r.sigungu_name);

  const { lastMonth, target, baseline } = checkMonths(today);
  const months = [lastMonth, target, ...baseline];
  const monthly = new Map<string, number>();
  await Promise.all([...regionNames.keys()].flatMap((lawd) => KINDS.flatMap((kind) => months.map(async (ym) => {
    monthly.set(monthlyKey(kind, lawd, ym), await countMonth(db, kind, lawd, ym));
  }))));

  // 가장 최근 daily 배치 (시군구·달별 기록이 있는 것)
  const last = check(await db.from("ingest_runs").select("batch_id").eq("job", "daily").not("lawd_cd", "is", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle(), "ingest_runs 최근 배치") as { batch_id: string } | null;
  const lastBatch = last
    ? check(await db.from("ingest_runs").select("source, lawd_cd, deal_ymd, error, marked_missing").eq("batch_id", last.batch_id), "ingest_runs 배치") as CheckInput["lastBatch"]
    : [];

  const idx = check(await db.from("price_index_weekly").select("week_date").order("week_date", { ascending: false }).limit(1).maybeSingle(),
    "price_index_weekly") as { week_date: string } | null;
  const latestRates = await Promise.all(["base", "mortgage"].map(async (series) => {
    const r = check(await db.from("rates_monthly").select("ym").eq("series", series).order("ym", { ascending: false }).limit(1).maybeSingle(),
      "rates_monthly") as { ym: string } | null;
    return { series, ym: r?.ym ?? null };
  }));

  return { today, regionNames, monthly, lastBatch, latestIndexWeek: idx?.week_date ?? null, latestRates };
}

export async function runCheck() {
  const db = serviceClient();
  const today = todayKst();
  const input = await gather(db, today);
  const { target } = checkMonths(today);
  const summary = [...input.regionNames].map(([lawd, nm]) =>
    `${nm} ${target} 매매 ${input.monthly.get(monthlyKey("trade", lawd, target))} / 전월세 ${input.monthly.get(monthlyKey("rent", lawd, target))}`);
  console.log(`[check] ${today}, 최근 수집 배치 ${input.lastBatch.length}개 기록, 주간 지수 ${input.latestIndexWeek}, 금리 ${input.latestRates.map((r) => `${r.series} ${r.ym}`).join(" · ")}`);
  for (const s of summary) console.log("  " + s);

  const problems = findAnomalies(input);
  if (problems.length === 0) {
    console.log("이상 없음");
    return;
  }
  console.log(`\n이상 ${problems.length}건:`);
  for (const p of problems) {
    console.log("  ⚠ " + p);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning::데이터 점검: ${p}`); // 메시지는 한 줄
  }
}

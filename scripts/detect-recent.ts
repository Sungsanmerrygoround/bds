// 백필 직후 1회용: 최근 N개월(기본 daily_lookback_months) 계약 거래에 대해 신고가·하락 판단
//   npx tsx scripts/detect-recent.ts [개월]
import "../ingest/env";
import { check, getSettingNum, selectAll, serviceClient } from "../ingest/db";

async function main() {
  const db = serviceClient();
  const months = Number(process.argv[2]) || (await getSettingNum(db, "daily_lookback_months", 3));
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceDate = since.toISOString().slice(0, 10);

  const rows = await selectAll<{ id: number }>(
    (from, to) => db.from("apt_trades").select("id").gte("deal_date", sinceDate).order("id").range(from, to),
    "apt_trades 조회",
  );
  let created = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const ids = rows.slice(i, i + 1000).map((r) => r.id);
    created += check(await db.rpc("detect_events", { p_trade_ids: ids }), "detect_events") as number;
  }
  console.log(`${sinceDate} 이후 거래 ${rows.length}건 판단 → 이벤트 ${created}건 생성`);
}
main();

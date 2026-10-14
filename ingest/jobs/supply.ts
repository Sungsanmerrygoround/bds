// 청약홈 입주 물량 수집
import type { Args } from "../args";
import { fetchAllApplyhome, toSupplyRows } from "../applyhome";
import { check, loadRegions, serviceClient } from "../db";
import type { CallCounter } from "../http";
import { recordRun } from "../runlog";

export async function runSupply(args: Args) {
  if (args.dry) {
    const counter: CallCounter = { calls: 0 };
    const items = await fetchAllApplyhome(counter);
    console.log(`청약홈 전체 ${items.length}건 (API ${counter.calls}회). --dry는 지역 매칭 없이 종료합니다.`);
    return;
  }
  const db = serviceClient();
  await recordRun(db, args, "supply", async (counter) => {
    const items = await fetchAllApplyhome(counter);
    const regions = (await loadRegions(db)).filter((r) => r.is_active);
    const rows = toSupplyRows(items, regions).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    // total_households_override는 payload에 없으므로 직접 입력한 보정값이 유지된다
    check(await db.from("supply_projects").upsert(rows, { onConflict: "house_manage_no" }), "supply_projects upsert");
    const excluded = rows.filter((r) => r.is_excluded);
    console.log(`청약홈 ${items.length}건 중 관심 지역 ${rows.length}건 저장 (입주 물량 제외 ${excluded.length}건), API ${counter.calls}회`);
    return { fetched: items.length, upserted: rows.length };
  });
}

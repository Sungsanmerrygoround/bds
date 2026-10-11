// 청약홈 입주 물량 수집
import { randomUUID } from "node:crypto";
import type { Args } from "../args";
import { fetchAllApplyhome, toSupplyRows } from "../applyhome";
import { check, loadRegions, serviceClient } from "../db";
import type { CallCounter } from "../http";

export async function runSupply(args: Args) {
  const counter: CallCounter = { calls: 0 };
  const items = await fetchAllApplyhome(counter);
  if (args.dry) {
    console.log(`청약홈 전체 ${items.length}건 (API ${counter.calls}회). --dry는 지역 매칭 없이 종료합니다.`);
    return;
  }
  const db = serviceClient();
  const batchId = randomUUID();
  const run = check(
    await db.from("ingest_runs").insert({ batch_id: batchId, job: "supply", source: "supply" }).select("id").single(),
    "ingest_runs insert",
  ) as { id: number };
  const regions = (await loadRegions(db)).filter((r) => r.is_active);
  const rows = toSupplyRows(items, regions).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  // total_households_override는 payload에 없으므로 직접 입력한 보정값이 유지된다
  check(await db.from("supply_projects").upsert(rows, { onConflict: "house_manage_no" }), "supply_projects upsert");
  check(await db.from("ingest_runs").update({
    status: "ok", finished_at: new Date().toISOString(),
    fetched: items.length, upserted: rows.length, api_calls: counter.calls,
  }).eq("id", run.id), "ingest_runs update");
  const excluded = rows.filter((r) => r.is_excluded);
  console.log(`청약홈 ${items.length}건 중 관심 지역 ${rows.length}건 저장 (입주 물량 제외 ${excluded.length}건), API ${counter.calls}회`);
}

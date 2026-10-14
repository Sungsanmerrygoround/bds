// 한국부동산원 주간 매매·전세 지수 수집 (시군구)
import type { Args } from "../args";
import { check, serviceClient } from "../db";
import type { CallCounter } from "../http";
import { fetchIndex, INDEX_START_WEEK, INDEX_TABLES } from "../reb";
import { recordRun } from "../runlog";

export async function runIndex(args: Args) {
  const db = serviceClient();
  const regions = check(
    await db.from("regions").select("id, sigungu_name, lawd_cd, reb_cls_id").eq("is_active", true).not("reb_cls_id", "is", null).order("sort_order"),
    "regions 조회",
  ) as { id: number; sigungu_name: string; lawd_cd: string; reb_cls_id: number }[];
  const targets = regions.filter((r) => !args.lawd || args.lawd.includes(r.lawd_cd));

  const work = async (counter: CallCounter) => {
    let fetched = 0;
    for (const r of targets) {
      for (const t of INDEX_TABLES) {
        const pts = await fetchIndex(t.kind, r.reb_cls_id, INDEX_START_WEEK, counter);
        if (pts.length === 0) throw new Error(`${r.sigungu_name} ${t.label}: 응답에 값이 없습니다`);
        fetched += pts.length;
        const last = pts.at(-1)!, prev = pts.at(-2);
        const wow = prev ? ((last.value / prev.value - 1) * 100).toFixed(2) : "-";
        console.log(`  ${r.sigungu_name} ${t.label}: ${pts.length}주 ${pts[0].week}~${last.week}, 최근 ${last.value.toFixed(2)} (전주 대비 ${wow}%)`);
        if (args.dry) continue;
        const now = new Date().toISOString();
        const rows = pts.map((p) => ({ region_id: r.id, kind: t.kind, week_date: p.week, value: p.value, updated_at: now }));
        check(await db.from("price_index_weekly").upsert(rows, { onConflict: "region_id,kind,week_date" }), "price_index_weekly upsert");
      }
    }
    console.log(`API 호출 ${counter.calls}회`);
    return { fetched, upserted: args.dry ? 0 : fetched };
  };
  await recordRun(db, args, "index", work);
}

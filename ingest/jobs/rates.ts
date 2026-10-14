// 한국은행 금리 수집 (기준금리·주담대, 월별)
import { DATA_START, recentMonths } from "../../lib/range";
import type { Args } from "../args";
import { check, serviceClient } from "../db";
import { fetchRates, RATE_SERIES } from "../ecos";
import { recordRun } from "../runlog";

export async function runRates(args: Args) {
  const to = recentMonths(1)[0];
  const from = args.from ?? DATA_START;
  const db = serviceClient();
  await recordRun(db, args, "rate", async (counter) => {
    let fetched = 0;
    for (const s of RATE_SERIES) {
      const pts = await fetchRates(s.series, from, to, counter);
      if (pts.length === 0) throw new Error(`${s.label}: 응답에 값이 없습니다`);
      fetched += pts.length;
      if (!args.dry) {
        const now = new Date().toISOString();
        const rows = pts.map((p) => ({ series: s.series, ym: p.ym, value: p.value, updated_at: now }));
        check(await db.from("rates_monthly").upsert(rows, { onConflict: "series,ym" }), "rates_monthly upsert");
      }
      console.log(
        `${s.label}: ${pts.length}개월${args.dry ? "" : " 저장"} (${pts[0].ym}~${pts.at(-1)!.ym}) / 최근 ${pts.slice(-3).map((p) => `${p.ym} ${p.value}%`).join(", ")}`,
      );
    }
    console.log(`API 호출 ${counter.calls}회`);
    return { fetched, upserted: args.dry ? 0 : fetched };
  });
}

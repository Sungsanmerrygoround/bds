// 마이그레이션을 PGlite(WASM Postgres)에서 실제 실행하고 이벤트 판단 로직을 검증한다.
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { areaBand } from "../lib/area";

const dir = join(__dirname, "migrations");
let db: PGlite;

async function trade(o: { date: string; price: number; area?: number; cancelled?: boolean; direct?: boolean; seq?: string }) {
  const area = o.area ?? 84.97;
  const key = `${o.seq ?? "T-1"}|${o.date}|${o.price}|${Math.random()}`;
  const r = await db.query<{ id: number }>(
    `insert into apt_trades (trade_key, apt_seq, region_id, lawd_cd, deal_ymd, deal_date, price_man, exclu_area, dealing_type, is_cancelled, raw)
     values ($1, $2, 1, '41117', to_char($3::date, 'YYYYMM'), $3, $4, $5, $6, $7, '{}') returning id`,
    [key, o.seq ?? "T-1", o.date, o.price, area, o.direct ? "직거래" : "중개", o.cancelled ?? false],
  );
  return r.rows[0].id;
}
const detect = async (ids: number[]) =>
  (await db.query<{ n: number }>("select detect_events($1::bigint[]) as n", [ids])).rows[0].n;
const eventsOf = async (id: number) =>
  (await db.query<{ type: string; ref_price_man: number; change_pct: string; is_direct: boolean; invalidated_at: string | null }>(
    "select type, ref_price_man, change_pct, is_direct, invalidated_at from events where trade_id = $1 order by type", [id])).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon; create role authenticated;"); // Supabase 기본 역할 흉내
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  }
  await db.exec(`insert into complexes (apt_seq, region_id, lawd_cd, apt_nm) values ('T-1', 1, '41117', '테스트'), ('T-2', 1, '41117', '테스트2')`);
});

describe("migrations", () => {
  it("시드: 5개 그룹, 6개 시군구, 구성남은 2개 시군구", async () => {
    const g = await db.query<{ name: string; n: number }>(
      "select g.name, count(*)::int n from regions r join region_groups g on g.id = r.group_id group by g.name");
    expect(g.rows).toHaveLength(5);
    expect(g.rows.find((r) => r.name === "구성남")?.n).toBe(2);
  });

  it("area_band SQL = lib/area.ts", async () => {
    const xs = [54.99, 55, 59.99, 64.99, 65, 79.99, 80, 84.97, 89.99, 90, 114.99, 115, 139.99, 140, 200];
    const r = await db.query<{ b: number | null }>("select area_band(x) b from unnest($1::numeric[]) x", [xs]);
    expect(r.rows.map((x) => x.b)).toEqual(xs.map(areaBand));
  });

  it("area_type은 소수 첫째 자리 반올림, 전세/월세 자동 분류", async () => {
    const id = await trade({ date: "2020-01-01", price: 1, area: 84.96, seq: "T-2" });
    const r = await db.query<{ area_type: string }>("select area_type from apt_trades where id = $1", [id]);
    expect(r.rows[0].area_type).toBe("85.0");
    await db.query(`insert into apt_rents (rent_key, apt_seq, region_id, lawd_cd, deal_ymd, deal_date, deposit_man, monthly_rent_man, exclu_area, raw)
      values ('a', 'T-2', 1, '41117', '202601', '2026-01-01', 50000, 0, 84.9, '{}'), ('b', 'T-2', 1, '41117', '202601', '2026-01-01', 5000, 100, 84.9, '{}')`);
    const t = await db.query<{ rent_type: string }>("select rent_type from apt_rents order by rent_key");
    expect(t.rows.map((x) => x.rent_type)).toEqual(["전세", "월세"]);
  });
});

describe("trend_monthly", () => {
  it("월별 매매·전세 중위가, 해제·월세 제외, 면적 구간 필터", async () => {
    await trade({ date: "2019-03-05", price: 50000, seq: "T-2" });
    await trade({ date: "2019-03-06", price: 70000, seq: "T-2" });
    await trade({ date: "2019-03-07", price: 90000, seq: "T-2", cancelled: true });
    await trade({ date: "2019-03-08", price: 30000, seq: "T-2", area: 59.9 });
    await db.query(`insert into apt_rents (rent_key, apt_seq, region_id, lawd_cd, deal_ymd, deal_date, deposit_man, monthly_rent_man, exclu_area, raw)
      values ('r1', 'T-2', 1, '41117', '201904', '2019-04-01', 40000, 0, 84.9, '{}'),
             ('r2', 'T-2', 1, '41117', '201904', '2019-04-02', 10000, 50, 84.9, '{}')`);
    const r = await db.query<{ ym: string; trade_median: number | null; trade_count: number; jeonse_median: number | null; jeonse_count: number }>(
      "select * from trend_monthly(1, 84::smallint, '201901', '201912')");
    expect(r.rows).toEqual([
      { ym: "201903", trade_median: 60000, trade_count: 2, jeonse_median: null, jeonse_count: 0 },
      { ym: "201904", trade_median: null, trade_count: 0, jeonse_median: 40000, jeonse_count: 1 },
    ]);
    const all = await db.query<{ trade_count: number }>("select * from trend_monthly(1, null, '201903', '201903')");
    expect(all.rows[0].trade_count).toBe(3);
  });
});

describe("complex_rank", () => {
  it("12개월·최근 3개월·1년 전 3개월 중위, 3.3㎡당 가격, 최고가", async () => {
    await db.exec(`insert into complexes (apt_seq, region_id, lawd_cd, apt_nm, build_year) values ('R-1', 1, '41117', '순위', 2010)`);
    await trade({ date: "2017-06-01", price: 99000, seq: "R-1" }); // 12개월 밖이지만 최고가
    await trade({ date: "2017-07-01", price: 60000, seq: "R-1" }); // 1년 전 3개월(1707~1709)
    await trade({ date: "2018-01-10", price: 70000, seq: "R-1" });
    await trade({ date: "2018-08-10", price: 80000, seq: "R-1" }); // 최근 3개월(1807~1809)
    await trade({ date: "2018-09-10", price: 90000, seq: "R-1", cancelled: true });
    const r = await db.query<Record<string, unknown>>("select * from complex_rank(1, 84::smallint, '201809') where apt_seq = 'R-1'");
    expect(r.rows[0]).toMatchObject({
      trades_12m: 2, median_12m: 75000, recent_median: 80000, recent_count: 1,
      year_ago_median: 60000, year_ago_count: 1, peak_price: 99000, build_year: 2010,
    });
    // 84.97㎡ → 3.3㎡당 = 가격 / 84.97 * 3.305785
    expect(r.rows[0].ppa_12m).toBe(Math.round((70000 / 84.97 * 3.305785 + 80000 / 84.97 * 3.305785) / 2));
    const peak = r.rows[0].peak_date as Date; // PGlite는 date를 로컬 자정 Date로 준다
    expect([peak.getFullYear(), peak.getMonth() + 1, peak.getDate()]).toEqual([2017, 6, 1]);
  });
});

describe("renewal_monthly · renewal_drops", () => {
  it("신규/갱신 수, 갱신요구권, 전세→전세 갱신의 보증금 변동률 중위와 감액 건수", async () => {
    const ins = (key: string, type: string | null, dep: number, pre: number | null, rent = 0, rr = false) =>
      db.query(`insert into apt_rents (rent_key, apt_seq, region_id, lawd_cd, deal_ymd, deal_date, deposit_man, monthly_rent_man,
                  exclu_area, contract_type, use_rr_right, pre_deposit_man, pre_monthly_rent_man, raw)
                values ($1, 'T-2', 1, '41117', '201805', '2018-05-03', $2, $3, 84.9, $4, $5, $6, 0, '{}')`,
        [key, dep, rent, type, rr ? true : null, pre]);
    await ins("n1", "신규", 50000, null);
    await ins("g1", "갱신", 45000, 50000, 0, true); // -10%
    await ins("g2", "갱신", 52500, 50000);          // +5%
    await ins("g3", "갱신", 55000, 50000);          // +10%
    await ins("g4", "갱신", 20000, 50000, 100);      // 월세 전환 → 변동률 계산 제외
    await ins("x1", null, 40000, null);              // 구분 없음 → 제외
    const r = await db.query<Record<string, unknown>>("select * from renewal_monthly(1, 84::smallint, '201805', '201805')");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ new_count: 1, renew_count: 4, rr_count: 1, jeonse_renew_count: 3, down_count: 1, up_count: 2,
      free_count: 2, rr_jeonse_count: 1 });
    expect(Number(r.rows[0].change_median)).toBe(5);
    expect(Number(r.rows[0].free_change_median)).toBe(7.5); // +5%, +10%
    expect(Number(r.rows[0].rr_change_median)).toBe(-10);
    const d = await db.query<{ change_pct: string; deposit_man: number }>("select * from renewal_drops(null, null, '2018-01-01', 10)");
    expect(d.rows.map((x) => [x.deposit_man, Number(x.change_pct)])).toEqual([[45000, -10]]);
  });
});

describe("complex_stats", () => {
  it("가장 많이 거래된 면적 기준 최근 거래·최고가", async () => {
    const r = await db.query<Record<string, unknown>>("select * from complex_stats(array['R-1'])");
    expect(r.rows[0]).toMatchObject({ apt_nm: "순위", area_type: "85.0", last_price: 80000, peak_price: 99000 });
  });
});

describe("detect_events", () => {
  it("신고가: 직전 36개월 최고가 초과만, 해제 거래는 비교에서 제외, 36개월 이전 고가는 무시", async () => {
    await trade({ date: "2021-06-01", price: 200000 });               // 36개월 이전 → 무시
    await trade({ date: "2025-01-10", price: 100000 });
    await trade({ date: "2025-03-10", price: 130000, cancelled: true }); // 해제 → 무시
    const high = await trade({ date: "2025-05-10", price: 110000, direct: true });
    const notHigh = await trade({ date: "2025-05-11", price: 105000 });
    expect(await detect([high, notHigh])).toBeGreaterThanOrEqual(1);
    expect(await eventsOf(high)).toMatchObject([{ type: "NEW_HIGH", ref_price_man: 100000, change_pct: "10.00", is_direct: true }]);
    expect(await eventsOf(notHigh)).toEqual([]);
  });

  it("하락: 직전 6개월 중위가 대비 -10% 이하, 표본 3건 이상", async () => {
    // 직전 6개월(2025-02-15~08-14): 110000, 105000, 108000 → 중위 108000 (1/10은 범위 밖, 3/10은 해제)
    await trade({ date: "2025-07-01", price: 108000 });
    const drop = await trade({ date: "2025-08-15", price: 94000 });   // 중위 108000 대비 -12.96%
    await detect([drop]);
    expect(await eventsOf(drop)).toMatchObject([{ type: "DROP", ref_price_man: 108000, change_pct: "-12.96" }]);
  });

  it("같은 거래를 다시 판단해도 중복 생성 안 함", async () => {
    const id = await trade({ date: "2025-09-01", price: 150000 });
    await detect([id]);
    await detect([id]);
    expect(await eventsOf(id)).toHaveLength(1);
  });

  it("나중에 해제되면 무효 처리, 해제 취소되면 복구", async () => {
    const id = await trade({ date: "2025-10-01", price: 160000 });
    await detect([id]);
    await db.query("update apt_trades set is_cancelled = true where id = $1", [id]);
    await db.query("select refresh_event_validity()");
    expect((await eventsOf(id))[0].invalidated_at).not.toBeNull();
    await db.query("update apt_trades set is_cancelled = false where id = $1", [id]);
    await db.query("select refresh_event_validity()");
    expect((await eventsOf(id))[0].invalidated_at).toBeNull();
  });
});

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
  it("시드: 4개 그룹, 5개 시군구(송파 제외), 구성남은 2개 시군구", async () => {
    const g = await db.query<{ name: string; n: number }>(
      "select g.name, count(*)::int n from regions r join region_groups g on g.id = r.group_id group by g.name");
    expect(g.rows).toHaveLength(4);
    expect(g.rows.find((r) => r.name === "구성남")?.n).toBe(2);
    expect(g.rows.find((r) => r.name === "송파")).toBeUndefined();
    expect((await db.query("select 1 from region_groups where name = '송파'")).rows).toHaveLength(0);
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
    // 전세: 구분 없음 40000, 신규 44000, 갱신 30000 → 전체 중위 40000(3건), 갱신 제외 42000(2건)
    await db.query(`insert into apt_rents (rent_key, apt_seq, region_id, lawd_cd, deal_ymd, deal_date, deposit_man, monthly_rent_man, exclu_area, contract_type, raw)
      values ('r1', 'T-2', 1, '41117', '201904', '2019-04-01', 40000, 0, 84.9, null, '{}'),
             ('r2', 'T-2', 1, '41117', '201904', '2019-04-02', 10000, 50, 84.9, null, '{}'),
             ('r3', 'T-2', 1, '41117', '201904', '2019-04-03', 44000, 0, 84.9, '신규', '{}'),
             ('r4', 'T-2', 1, '41117', '201904', '2019-04-04', 30000, 0, 84.9, '갱신', '{}')`);
    const r = await db.query<Record<string, unknown>>("select * from trend_monthly(1, 84::smallint, '201901', '201912')");
    expect(r.rows).toEqual([
      { ym: "201903", trade_median: 60000, trade_count: 2, jeonse_median: null, jeonse_count: 0, jeonse_new_median: null, jeonse_new_count: 0 },
      { ym: "201904", trade_median: null, trade_count: 0, jeonse_median: 40000, jeonse_count: 3, jeonse_new_median: 42000, jeonse_new_count: 2 },
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

describe("외부 데이터 테이블 (금리·지수·단지정보)", () => {
  it("rates_monthly: (계열, 월) 기본키, 계열 이름 제한", async () => {
    await db.query("insert into rates_monthly (series, ym, value) values ('base', '202609', 3), ('mortgage', '202608', 4.66)");
    await expect(db.query("insert into rates_monthly (series, ym, value) values ('base', '202609', 3.25)")).rejects.toThrow();
    await expect(db.query("insert into rates_monthly (series, ym, value) values ('cd', '202609', 3)")).rejects.toThrow();
  });
  it("ingest_runs.source: 금리·지수·단지정보 허용, 그 밖은 거부", async () => {
    for (const s of ["trade", "rent", "supply", "rate", "index", "kapt"]) {
      await db.query("insert into ingest_runs (batch_id, job, source) values (gen_random_uuid(), 'test', $1)", [s]);
    }
    await expect(db.query("insert into ingest_runs (batch_id, job, source) values (gen_random_uuid(), 'test', 'other')")).rejects.toThrow();
  });
  it("complex_rank: K-apt 세대수 붙이기 (짝 없으면 null)", async () => {
    await db.exec(`insert into complex_info (apt_seq, kapt_code, households, match_method) values ('R-1', 'A1', 1234, 'jibun')`);
    const r = await db.query<{ apt_seq: string; households: number | null }>("select apt_seq, households from complex_rank(1, null, '201809') order by apt_seq");
    expect(r.rows.find((x) => x.apt_seq === "R-1")?.households).toBe(1234);
    // 회전율용 전체 면적 12개월 매매(1710~1809, 해제 제외): 84㎡ 2건 + 59㎡ 1건 = 3, 84㎡ 기준 trades_12m은 그대로 2
    await trade({ date: "2018-05-01", price: 50000, seq: "R-1", area: 59.9 });
    const all = await db.query<{ trades_12m: number; trades_all_12m: number }>("select trades_12m, trades_all_12m from complex_rank(1, 84::smallint, '201809') where apt_seq = 'R-1'");
    expect(all.rows[0]).toEqual({ trades_12m: 2, trades_all_12m: 3 });
    expect(r.rows.filter((x) => x.apt_seq !== "R-1").every((x) => x.households == null)).toBe(true);
  });
  it("complex_info: match_method 제한, 단지 삭제 시 함께 삭제", async () => {
    await expect(db.query("insert into complex_info (apt_seq, kapt_code, match_method) values ('T-2', 'A2', 'guess')")).rejects.toThrow();
    await db.exec("insert into complexes (apt_seq, region_id, lawd_cd, apt_nm) values ('D-1', 1, '41117', '삭제')");
    await db.exec("insert into complex_info (apt_seq, kapt_code, match_method) values ('D-1', 'A3', 'name')");
    await db.exec("delete from complexes where apt_seq = 'D-1'");
    expect((await db.query("select 1 from complex_info where apt_seq = 'D-1'")).rows).toHaveLength(0);
  });
  it("kapt_complexes: 목록 등록 후 기본정보 채우기, price_index_weekly는 월요일만", async () => {
    await db.exec("insert into kapt_complexes (kapt_code, kapt_name, lawd_cd, bjd_code, dong) values ('A9', '매탄극동', '41117', '4111710100', '매탄동')");
    const r = await db.query<{ is_listed: boolean; basis_at: string | null }>("select is_listed, basis_at from kapt_complexes where kapt_code = 'A9'");
    expect(r.rows[0]).toEqual({ is_listed: true, basis_at: null });
    await db.exec("insert into price_index_weekly (region_id, kind, week_date, value) values (1, 'sale', '2026-10-05', 100.62404)");
    await expect(db.query("insert into price_index_weekly (region_id, kind, week_date, value) values (1, 'sale', '2026-10-06', 100)")).rejects.toThrow();
    const reb = await db.query<{ n: number }>("select count(*)::int n from regions where reb_cls_id is not null");
    expect(reb.rows[0].n).toBe(5);
  });
});

describe("전세 신규 기준 (갱신 제외)", () => {
  const rent = (key: string, seq: string, date: string, dep: number, type: string | null, rentMan = 0, area = 84.9) =>
    db.query(`insert into apt_rents (rent_key, apt_seq, region_id, lawd_cd, deal_ymd, deal_date, deposit_man, monthly_rent_man, exclu_area, contract_type, raw)
              values ($1, $2, 1, '41117', to_char($3::date, 'YYYYMM'), $3, $4, $5, $6, $7, '{}')`, [key, seq, date, dep, rentMan, area, type]);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  it("complex_rank: 12개월 전세 중위는 갱신·월세·기간 밖 계약을 뺀다", async () => {
    await rent("k1", "R-1", "2018-03-01", 40000, "신규");
    await rent("k2", "R-1", "2018-04-01", 50000, null);
    await rent("k3", "R-1", "2018-05-01", 10000, "갱신");
    await rent("k4", "R-1", "2018-06-01", 5000, "신규", 100);
    await rent("k5", "R-1", "2017-09-01", 90000, "신규"); // 12개월(1710~1809) 밖
    const r = await db.query<Record<string, unknown>>("select jeonse_median_12m, jeonse_count_12m from complex_rank(1, 84::smallint, '201809') where apt_seq = 'R-1'");
    expect(r.rows[0]).toEqual({ jeonse_median_12m: 45000, jeonse_count_12m: 2 });
    // 전세가 없는 면적은 중위 null, 건수 0
    const none = await db.query<Record<string, unknown>>("select jeonse_median_12m, jeonse_count_12m from complex_rank(1, 59::smallint, '201809') where apt_seq = 'R-1'");
    expect(none.rows[0]).toEqual({ jeonse_median_12m: null, jeonse_count_12m: 0 });
  });

  it("complex_stats: 최근 6개월 전세 중위를 전체와 갱신 제외로 따로", async () => {
    await db.exec(`insert into complexes (apt_seq, region_id, lawd_cd, apt_nm) values ('S-1', 1, '41117', '요약')`);
    await trade({ date: daysAgo(40), price: 100000, seq: "S-1" });
    await rent("s1", "S-1", daysAgo(30), 60000, "신규", 0, 84.97);
    await rent("s2", "S-1", daysAgo(20), 40000, "갱신", 0, 84.97);
    await rent("s3", "S-1", daysAgo(10), 44000, "갱신", 0, 84.97);
    await rent("s4", "S-1", daysAgo(400), 10000, "신규", 0, 84.97); // 6개월 밖
    const r = await db.query<Record<string, unknown>>("select * from complex_stats(array['S-1'])");
    expect(r.rows[0]).toMatchObject({ jeonse_median_6m: 44000, jeonse_count_6m: 3, jeonse_new_median_6m: 60000, jeonse_new_count_6m: 1 });
  });
});

describe("rent_monthly", () => {
  it("월세 비중, 월세 중위, 전월세 전환율(같은 단지·면적의 전후 90일 신규 전세 기준)", async () => {
    await db.exec(`insert into complexes (apt_seq, region_id, lawd_cd, apt_nm) values ('W-1', 1, '41117', '월세'), ('W-2', 1, '41117', '월세2')`);
    const ins = (key: string, seq: string, date: string, dep: number, rentMan: number, type: string | null) =>
      db.query(`insert into apt_rents (rent_key, apt_seq, region_id, lawd_cd, deal_ymd, deal_date, deposit_man, monthly_rent_man, exclu_area, contract_type, raw)
                values ($1, $2, 1, '41117', to_char($3::date, 'YYYYMM'), $3, $4, $5, 84.9, $6, '{}')`, [key, seq, date, dep, rentMan, type]);
    await ins("w1", "W-1", "2016-06-10", 50000, 0, "신규");   // 기준 전세
    await ins("w2", "W-1", "2016-06-11", 30000, 0, "갱신");   // 갱신 전세는 기준에서 제외
    await ins("w3", "W-1", "2016-06-15", 10000, 100, "신규"); // 100 × 12 ÷ (50000 − 10000) = 3%
    await ins("w4", "W-1", "2016-06-16", 20000, 50, "갱신");  // 갱신 월세: 전환율·중위 제외
    await ins("w5", "W-2", "2016-06-17", 5000, 80, null);     // 기준 전세가 없는 단지: 전환율 제외
    await ins("w6", "W-1", "2016-06-18", 60000, 10, "신규");  // 보증금이 기준 전세 이상: 전환율 제외
    await ins("w7", "W-1", "2016-01-01", 90000, 0, "신규");   // 90일 밖 전세는 기준에 안 들어감
    const r = await db.query<Record<string, unknown>>("select * from rent_monthly(1, 84::smallint, '201606', '201606')");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      ym: "201606", jeonse_count: 2, wolse_count: 4, jeonse_new_count: 1, wolse_new_count: 3,
      wolse_deposit_median: 10000, wolse_rent_median: 80, conv_count: 1,
    });
    expect(Number(r.rows[0].conv_rate_median)).toBe(3);
    // 다른 그룹에는 없다
    expect((await db.query("select * from rent_monthly(2, null, '201606', '201606')")).rows).toHaveLength(0);
  });
});

describe("new_trades · new_rents", () => {
  it("처음 수집된 시각 기준, 직전 유효 거래와 신고가 여부를 붙인다", async () => {
    await db.exec(`insert into complexes (apt_seq, region_id, lawd_cd, apt_nm) values ('N-1', 1, '41117', '새거래')`);
    await trade({ date: "2024-01-10", price: 100000, seq: "N-1" });
    await trade({ date: "2024-02-10", price: 150000, seq: "N-1", cancelled: true }); // 해제 거래는 직전 거래로 안 씀
    const b = await trade({ date: "2024-03-10", price: 120000, seq: "N-1" });
    await detect([b]);
    const r = await db.query<Record<string, unknown>>("select * from new_trades(now() - interval '1 hour', 1, 5000) where apt_seq = 'N-1' order by deal_date");
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ price_man: 100000, prev_price: null, event_type: null, apt_nm: "새거래" });
    expect(r.rows[1]).toMatchObject({ price_man: 150000, is_cancelled: true, prev_price: 100000 });
    expect(r.rows[2]).toMatchObject({ price_man: 120000, prev_price: 100000, event_type: "NEW_HIGH", event_pct: "20.00" });
    // 기준 시각 이후에 처음 본 거래만, 다른 그룹은 제외, 사라진 거래 제외
    expect((await db.query("select 1 from new_trades(now() + interval '1 hour', null)")).rows).toHaveLength(0);
    expect((await db.query("select 1 from new_trades(now() - interval '1 hour', 2)")).rows).toHaveLength(0);
    await db.query("update apt_trades set missing_since = now() where id = $1", [b]);
    expect((await db.query("select 1 from new_trades(now() - interval '1 hour', 1, 5000) where apt_seq = 'N-1'")).rows).toHaveLength(2);
    await db.query("update apt_trades set missing_since = null where id = $1", [b]);
  });

  it("전월세: 갱신 계약의 종전 보증금까지", async () => {
    await db.query(`insert into apt_rents (rent_key, apt_seq, region_id, lawd_cd, deal_ymd, deal_date, deposit_man, monthly_rent_man, exclu_area, contract_type, pre_deposit_man, pre_monthly_rent_man, raw)
      values ('nr1', 'N-1', 1, '41117', '202403', '2024-03-05', 52500, 0, 84.9, '갱신', 50000, 0, '{}')`);
    const r = await db.query<Record<string, unknown>>("select * from new_rents(now() - interval '1 hour', 1, 5000) where apt_seq = 'N-1'");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ deposit_man: 52500, monthly_rent_man: 0, contract_type: "갱신", pre_deposit_man: 50000 });
    expect((await db.query("select 1 from new_rents(now() + interval '1 hour', null)")).rows).toHaveLength(0);
  });

  it("단지 목록을 주면 그 단지들만 (관심 단지), 빈 목록이면 없음", async () => {
    const since = "now() - interval '1 hour'";
    const seqs = async (fn: string, list: string) =>
      [...new Set((await db.query<{ apt_seq: string }>(`select apt_seq from ${fn}(${since}, null, 5000, ${list})`)).rows.map((r) => r.apt_seq))].sort();
    expect(await seqs("new_trades", "array['N-1', 'C-9']")).toEqual(["N-1"]);
    expect(await seqs("new_trades", "array['N-1', 'R-1']")).toEqual(["N-1", "R-1"]);
    expect(await seqs("new_trades", "array[]::text[]")).toEqual([]);
    expect((await seqs("new_trades", "null")).length).toBeGreaterThan(2);
    expect(await seqs("new_rents", "array['N-1']")).toEqual(["N-1"]);
    expect(await seqs("new_rents", "array['T-1']")).toEqual([]);
    // 그룹 조건과 함께: 다른 그룹이면 없음
    expect((await db.query("select 1 from new_trades(now() - interval '1 hour', 2, 5000, array['N-1'])")).rows).toHaveLength(0);
  });
});

describe("cancelled_trades", () => {
  it("해제 거래의 계약 당시 직전 36개월 최고가와 해제 전 후속 거래", async () => {
    await db.exec(`insert into complexes (apt_seq, region_id, lawd_cd, apt_nm) values ('C-1', 1, '41117', '해제')`);
    await trade({ date: "2019-01-01", price: 200000, seq: "C-1" }); // 36개월 이전 → 비교 제외
    await trade({ date: "2023-01-10", price: 100000, seq: "C-1" });
    await trade({ date: "2023-06-10", price: 190000, seq: "C-1", cancelled: true }); // 해제 거래는 비교 제외
    const c = await trade({ date: "2024-02-01", price: 130000, seq: "C-1", cancelled: true });
    await db.query("update apt_trades set cancel_date = '2024-04-01' where id = $1", [c]);
    await trade({ date: "2024-03-01", price: 125000, seq: "C-1" }); // 계약 뒤 ~ 해제일 사이 후속 거래
    await trade({ date: "2024-05-01", price: 140000, seq: "C-1" }); // 해제 뒤 → 후속 거래 아님
    const r = await db.query<Record<string, unknown>>("select * from cancelled_trades(1, '2024-01-01', 100) where apt_seq = 'C-1'");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ price_man: 130000, prev_max: 100000, prev_count: 1, later_count: 1, later_max: 125000, apt_nm: "해제" });
    // 해제일이 기준일보다 이르면 제외, 다른 그룹 제외
    expect((await db.query("select 1 from cancelled_trades(1, '2024-04-02', 100) where apt_seq = 'C-1'")).rows).toHaveLength(0);
    expect((await db.query("select 1 from cancelled_trades(2, '2024-01-01', 100)")).rows).toHaveLength(0);
  });

  it("비교할 직전 거래가 없으면 prev_max는 null, 건수 0", async () => {
    await db.exec(`insert into complexes (apt_seq, region_id, lawd_cd, apt_nm) values ('C-2', 1, '41117', '해제2')`);
    const c = await trade({ date: "2024-02-01", price: 130000, seq: "C-2", cancelled: true });
    await db.query("update apt_trades set cancel_date = '2024-02-20' where id = $1", [c]);
    const r = await db.query<Record<string, unknown>>("select prev_max, prev_count, later_count, later_max from cancelled_trades(null, '2024-01-01', 100) where apt_seq = 'C-2'");
    expect(r.rows[0]).toEqual({ prev_max: null, prev_count: 0, later_count: 0, later_max: null });
  });
});

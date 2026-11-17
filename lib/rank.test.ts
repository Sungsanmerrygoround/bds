import { describe, expect, it } from "vitest";
import type { RankRow } from "./queries";
import { deriveRank, JEONSE_MIN, sortRanked } from "./rank";

const row = (o: Partial<RankRow> = {}): RankRow => ({
  apt_seq: "A", apt_nm: "단지", umd_nm: null, sigungu_name: "구", build_year: 2000,
  trades_12m: 10, median_12m: 100000, ppa_12m: 4000,
  recent_median: 110000, recent_count: 3, year_ago_median: 100000, year_ago_count: 3,
  peak_price: 125000, peak_date: "2022-01-01", households: 500, trades_all_12m: 25,
  jeonse_median_12m: 60000, jeonse_count_12m: 4,
  ...o,
});

describe("deriveRank", () => {
  it("현재가·1년 변동·최고가 대비·회전율·전세가율·갭", () => {
    const r = deriveRank(row());
    expect(r.current).toBe(110000);
    expect(r.chg).toBeCloseTo(10);
    expect(r.peakRatio).toBeCloseTo(88);
    expect(r.turnover).toBe(5);
    expect(r.jeonse).toBe(60000);
    expect(r.ratio).toBe(60);
    expect(r.gap).toBe(40000);
  });

  it("최근 3개월 거래가 없으면 12개월 중위로 최고가 대비", () => {
    const r = deriveRank(row({ recent_count: 0, recent_median: null }));
    expect(r.current).toBe(100000);
    expect(r.peakRatio).toBeCloseTo(80);
    expect(r.chg).toBeNull();
  });

  it("1년 변동은 양쪽 3개월 표본이 2건 이상일 때만", () => {
    expect(deriveRank(row({ recent_count: 1 })).chg).toBeNull();
    expect(deriveRank(row({ year_ago_count: 1 })).chg).toBeNull();
    expect(deriveRank(row({ recent_count: 2, year_ago_count: 2 })).chg).not.toBeNull();
  });

  it(`전세가 ${JEONSE_MIN}건 미만이면 전세가율·갭 없음, 세대수를 모르면 회전율 없음`, () => {
    const r = deriveRank(row({ jeonse_count_12m: JEONSE_MIN - 1, households: null }));
    expect([r.jeonse, r.ratio, r.gap, r.turnover]).toEqual([null, null, null, null]);
    expect(deriveRank(row({ jeonse_count_12m: JEONSE_MIN })).jeonse).toBe(60000);
  });
});

describe("sortRanked", () => {
  const rows = () => [
    deriveRank(row({ apt_seq: "A", ppa_12m: 3000, trades_12m: 5, jeonse_median_12m: 70000 })), // 갭 3억
    deriveRank(row({ apt_seq: "B", ppa_12m: 5000, trades_12m: 9, jeonse_count_12m: 0 })), // 전세 없음
    deriveRank(row({ apt_seq: "C", ppa_12m: 5000, trades_12m: 20, jeonse_median_12m: 50000 })), // 갭 5억
  ];
  const order = (sort: Parameters<typeof sortRanked>[1]) => sortRanked(rows(), sort).map((r) => r.apt_seq);

  it("값이 큰 순, 같으면 거래가 많은 순", () => {
    expect(order("ppa")).toEqual(["C", "B", "A"]);
    expect(order("vol")).toEqual(["C", "B", "A"]);
  });
  it("전세가율은 높은 순, 갭은 작은 순, 값이 없는 단지는 맨 뒤", () => {
    expect(order("ratio")).toEqual(["A", "C", "B"]);
    expect(order("gap")).toEqual(["A", "C", "B"]);
  });
  it("최고가 대비는 낮은 순", () => {
    const r = sortRanked([deriveRank(row({ apt_seq: "hi", peak_price: 110000 })), deriveRank(row({ apt_seq: "lo", peak_price: 200000 }))], "peak");
    expect(r.map((x) => x.apt_seq)).toEqual(["lo", "hi"]);
  });
});

import { describe, expect, it } from "vitest";
import { checkMonths, findAnomalies, monthlyKey, type CheckInput } from "./check";

// 2026-11-21 기준: 비교 대상 202609, 직전 6개월 202603~202608, 지난달 202610
const base = (o: Partial<CheckInput> = {}): CheckInput => {
  const monthly = new Map<string, number>();
  for (const kind of ["trade", "rent"] as const) {
    for (const ym of ["202603", "202604", "202605", "202606", "202607", "202608", "202609", "202610"]) monthly.set(monthlyKey(kind, "41117", ym), 100);
  }
  return {
    today: "2026-11-21",
    regionNames: new Map([["41117", "영통구"]]),
    monthly,
    lastBatch: [{ source: "trade", lawd_cd: "41117", deal_ymd: "202611", error: null, marked_missing: 0 }],
    latestIndexWeek: "2026-11-16",
    latestRates: [{ series: "base", ym: "202610" }, { series: "mortgage", ym: "202609" }],
    ...o,
  };
};

describe("checkMonths", () => {
  it("2달 전이 비교 대상, 그 앞 6개월이 기준, 연도 넘김", () => {
    expect(checkMonths("2026-11-21")).toEqual({ lastMonth: "202610", target: "202609", baseline: ["202608", "202607", "202606", "202605", "202604", "202603"] });
    expect(checkMonths("2027-01-05").target).toBe("202611");
  });
});

describe("findAnomalies", () => {
  it("평소 같으면 이상 없음", () => {
    expect(findAnomalies(base())).toEqual([]);
  });

  it("비교 달 거래가 직전 6개월 중위의 15% 미만이면 이상, 그 이상이면 정상", () => {
    const low = base();
    low.monthly.set(monthlyKey("trade", "41117", "202609"), 14);
    expect(findAnomalies(low)).toEqual([expect.stringContaining("영통구(41117) 매매 202609: 14건 — 직전 6개월 중위 100건의 14%")]);
    const ok = base();
    ok.monthly.set(monthlyKey("rent", "41117", "202609"), 15);
    expect(findAnomalies(ok)).toEqual([]);
  });

  it("거래가 원래 적은 곳(중위 20건 미만)은 비율 검사 안 함", () => {
    const small = base();
    for (const ym of ["202603", "202604", "202605", "202606", "202607", "202608"]) small.monthly.set(monthlyKey("trade", "41117", ym), 10);
    small.monthly.set(monthlyKey("trade", "41117", "202609"), 0);
    small.monthly.set(monthlyKey("trade", "41117", "202610"), 0);
    expect(findAnomalies(small)).toEqual([]);
  });

  it("지난달 0건은 10일부터 이상", () => {
    const m = base();
    m.monthly.set(monthlyKey("rent", "41117", "202610"), 0);
    expect(findAnomalies(m)).toEqual([expect.stringContaining("전월세 202610: 0건")]);
    expect(findAnomalies({ ...m, today: "2026-11-09" }).filter((s) => s.includes("0건"))).toEqual([]);
  });

  it("최근 수집에서 대량으로 사라졌거나 가드가 걸리면 이상", () => {
    const r = findAnomalies(base({
      lastBatch: [
        { source: "rent", lawd_cd: "41117", deal_ymd: "202610", error: "기존 행 20% 이상이 응답에서 사라져 missing 처리를 건너뜀", marked_missing: 0 },
        { source: "trade", lawd_cd: "41117", deal_ymd: "202609", error: null, marked_missing: 11 },
        { source: "trade", lawd_cd: "41117", deal_ymd: "202608", error: null, marked_missing: 10 },
      ],
    }));
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("전월세 202610: 기존 거래의 20% 이상");
    expect(r[1]).toContain("매매 202609: 한 번에 11건");
  });

  it("주간 지수 14일·금리 3개월보다 오래되면 이상", () => {
    expect(findAnomalies(base({ latestIndexWeek: "2026-11-07" }))).toEqual([]);
    expect(findAnomalies(base({ latestIndexWeek: "2026-11-06" }))).toEqual([expect.stringContaining("주간 지수: 가장 최근 주가 2026-11-06 (15일 전)")]);
    expect(findAnomalies(base({ latestIndexWeek: null }))).toEqual(["부동산원 주간 지수: 데이터 없음"]);
    // 11월 기준 3개월 전(202608)까지는 정상, 그보다 오래됐거나 없으면 이상
    expect(findAnomalies(base({ latestRates: [{ series: "base", ym: "202608" }, { series: "mortgage", ym: "202607" }] }))).toEqual(["금리 mortgage: 가장 최근 달이 202607"]);
    expect(findAnomalies(base({ latestRates: [{ series: "base", ym: null }] }))).toEqual(["금리 base: 가장 최근 달이 없음"]);
  });
});

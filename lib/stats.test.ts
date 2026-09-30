import { describe, expect, it } from "vitest";
import { isUnregistered, median, movingAvg, peakRecovery, pctChange, rollingMedian } from "./stats";

describe("median", () => {
  it("홀수·짝수·빈 배열", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("movingAvg", () => {
  it("3개월 창, 과반(2개) 이상일 때만", () => {
    expect(movingAvg([1, 2, 3, null, null, 6])).toEqual([null, null, 2, 2.5, null, null]);
  });
});

describe("peakRecovery", () => {
  const months = ["202101", "202102", "202103", "202104", "202105", "202106", "202107"];
  it("이동평균 고점과 집계 끝난 최근 달", () => {
    //            MA:          -    -    10   12   11   9    (202107은 집계 중이라 제외)
    const p = peakRecovery(months, [9, 10, 11, 15, 7, 5, 99], "202106")!;
    expect(p.peakYm).toBe("202104");
    expect(p.peak).toBeCloseTo(12);
    expect(p.nowYm).toBe("202106");
    expect(p.now).toBeCloseTo(9);
    expect(p.ratio).toBeCloseTo(75);
  });
  it("값이 없으면 null", () => {
    expect(peakRecovery(months, months.map(() => null), "202106")).toBeNull();
  });
});

describe("rollingMedian", () => {
  it("그 달 포함 3개월 거래를 모아 중위", () => {
    const months = ["202101", "202102", "202103", "202104", "202105"];
    const deals = [
      { ym: "202101", price: 10 },
      { ym: "202102", price: 20 },
      { ym: "202102", price: 30 },
    ];
    expect(rollingMedian(months, deals)).toEqual([10, 20, 20, 25, null]);
  });
});

describe("isUnregistered", () => {
  it("180일 넘게 등기일 없음, 해제 거래는 제외", () => {
    expect(isUnregistered({ deal_date: "2026-01-01", rgst_date: null, is_cancelled: false }, "2026-09-30")).toBe(true);
    expect(isUnregistered({ deal_date: "2026-06-01", rgst_date: null, is_cancelled: false }, "2026-09-30")).toBe(false);
    expect(isUnregistered({ deal_date: "2026-01-01", rgst_date: "2026-03-01", is_cancelled: false }, "2026-09-30")).toBe(false);
    expect(isUnregistered({ deal_date: "2026-01-01", rgst_date: null, is_cancelled: true }, "2026-09-30")).toBe(false);
  });
});

describe("pctChange", () => {
  it("a/b-1", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(100, 0)).toBeNull();
  });
});

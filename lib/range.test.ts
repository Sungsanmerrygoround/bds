import { describe, expect, it } from "vitest";
import { addMonths, currentYm, lastCompleteYm, monthsBetween, partialFromYm, rangeLabel, resolveRange } from "./range";

// 2026-09-28 10:00 KST
const now = new Date("2026-09-28T01:00:00Z");

describe("range", () => {
  it("KST 기준 이번 달 (UTC 말일 밤 = KST 다음 달)", () => {
    expect(currentYm(now)).toBe("202609");
    expect(currentYm(new Date("2026-09-30T16:00:00Z"))).toBe("202610");
  });
  it("addMonths / monthsBetween", () => {
    expect(addMonths("202601", -1)).toBe("202512");
    expect(addMonths("202612", 1)).toBe("202701");
    expect(monthsBetween("202511", "202602")).toEqual(["202511", "202512", "202601", "202602"]);
  });
  it("기본 3년 = 이번 달 포함 36개월", () => {
    expect(resolveRange({}, now)).toEqual({ from: "202310", to: "202609", key: "3y" });
    expect(resolveRange({ range: "1y" }, now)).toEqual({ from: "202510", to: "202609", key: "1y" });
    expect(resolveRange({ range: "5y" }, now)).toEqual({ from: "202110", to: "202609", key: "5y" });
    expect(resolveRange({ range: "zzz" }, now).key).toBe("3y");
  });
  it("집계 중 시작 월 / 집계 끝난 최근 달", () => {
    expect(partialFromYm(now)).toBe("202608");
    expect(lastCompleteYm(now)).toBe("202607");
  });
  it("rangeLabel", () => {
    expect(rangeLabel({ from: "202310", to: "202609", key: "3y" })).toBe("3년");
    expect(rangeLabel({ from: "202401", to: "202406", key: "custom" })).toBe("24.01–24.06");
  });
  it("직접 지정: 잘못된 값·역순은 무시, 미래는 이번 달로", () => {
    expect(resolveRange({ from: "202401", to: "202406" }, now)).toEqual({ from: "202401", to: "202406", key: "custom" });
    expect(resolveRange({ from: "202401", to: "203001" }, now).to).toBe("202609");
    expect(resolveRange({ from: "202413" }, now).key).toBe("3y");
    expect(resolveRange({ from: "202606", to: "202601" }, now).key).toBe("3y");
  });
});

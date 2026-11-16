import { describe, expect, it } from "vitest";
import {
  addDays, addMonths, currentYm, daysBetween, kstDateOf, lastCompleteYm, maxYm, minYm, monthEnd, monthsAgo, monthsBetween, monthStart, partialFromYm,
  partialIndex, rangeLabel, recentMonths, resolveRange, ymOfDate,
} from "./range";

describe("kstDateOf · addDays · daysBetween", () => {
  it("ISO 시각의 KST 날짜 (UTC 15시부터 다음 날)", () => {
    expect(kstDateOf("2026-11-13T14:59:59Z")).toBe("2026-11-13");
    expect(kstDateOf("2026-11-13T15:00:00Z")).toBe("2026-11-14");
    expect(kstDateOf("2026-11-14T02:19:06.86329+00:00")).toBe("2026-11-14");
  });
  it("날짜 더하기는 달·해를 넘긴다", () => {
    expect(addDays("2026-11-16", -2)).toBe("2026-11-14");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-16", 0)).toBe("2026-11-16");
  });
  it("두 날짜 사이 일수 (뒤 − 앞)", () => {
    expect(daysBetween("2026-10-14", "2026-11-13")).toBe(30);
    expect(daysBetween("2026-11-13", "2026-11-13")).toBe(0);
    expect(daysBetween("2026-11-13", "2026-11-10")).toBe(-3);
  });
});

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

describe("monthStart · monthEnd", () => {
  it("그달 첫날·마지막 날 (윤년 2월 포함)", () => {
    expect(monthStart("202609")).toBe("2026-09-01");
    expect(monthEnd("202609")).toBe("2026-09-30");
    expect(monthEnd("202612")).toBe("2026-12-31");
    expect(monthEnd("202802")).toBe("2028-02-29");
    expect(monthEnd("202702")).toBe("2027-02-28");
  });
});

describe("partialIndex", () => {
  it("집계 중(이번 달·지난달) 첫 인덱스, 없으면 길이", () => {
    // now = 2026-09-28 KST → 집계 중은 202608부터
    expect(partialIndex(["202606", "202607", "202608", "202609"], now)).toBe(2);
    expect(partialIndex(["202601", "202602"], now)).toBe(2);
    expect(partialIndex(["202610"], now)).toBe(0);
  });
});

describe("recentMonths", () => {
  it("이번 달 포함 최근 n개월, 해 넘김", () => {
    expect(recentMonths(3, now)).toEqual(["202607", "202608", "202609"]);
    expect(recentMonths(1, now)).toEqual(["202609"]);
    expect(recentMonths(10, now)[0]).toBe("202512");
    // 2026-01-01 00:30 KST(= 2025-12-31 15:30 UTC)는 1월
    expect(recentMonths(2, new Date("2025-12-31T15:30:00Z"))).toEqual(["202512", "202601"]);
  });
  it("기존 수집 스크립트의 계산(UTC 날짜 연산)과 같음", () => {
    const old = (n: number, at: Date) => {
      const kst = new Date(at.getTime() + 9 * 3600_000);
      const out: string[] = [];
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - i, 1));
        out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
      }
      return out;
    };
    for (const at of ["2026-09-28T01:00:00Z", "2025-12-31T15:30:00Z", "2026-02-28T20:00:00Z", "2024-02-29T03:00:00Z"]) {
      for (const n of [1, 3, 9, 36, 61]) expect(recentMonths(n, new Date(at))).toEqual(old(n, new Date(at)));
    }
  });
});

describe("ymOfDate · minYm · maxYm", () => {
  it("날짜 → 달, 이른 달·늦은 달", () => {
    expect(ymOfDate("2026-09-18")).toBe("202609");
    expect(minYm("202310", "202110")).toBe("202110");
    expect(maxYm("202310", "202110")).toBe("202310");
    expect(minYm("202501", "202501")).toBe("202501");
  });
});

describe("monthsAgo", () => {
  it("KST 오늘 기준 n개월 전 같은 날", () => {
    expect(monthsAgo(3, now)).toBe("2026-06-28");
    expect(monthsAgo(12, now)).toBe("2025-09-28");
    // UTC로는 아직 9/30이지만 KST는 10/1
    expect(monthsAgo(1, new Date("2026-09-30T16:00:00Z"))).toBe("2026-09-01");
  });
  it("그 달에 같은 날이 없으면 말일 (setMonth처럼 다음 달로 넘치지 않음)", () => {
    expect(monthsAgo(1, new Date("2026-10-31T03:00:00Z"))).toBe("2026-09-30");
    expect(monthsAgo(1, new Date("2026-03-31T03:00:00Z"))).toBe("2026-02-28");
    expect(monthsAgo(1, new Date("2028-03-30T03:00:00Z"))).toBe("2028-02-29");
    expect(monthsAgo(6, new Date("2026-08-31T03:00:00Z"))).toBe("2026-02-28");
    expect(monthsAgo(1, new Date("2026-01-15T03:00:00Z"))).toBe("2025-12-15");
  });
});

import { describe, expect, it } from "vitest";
import { changePct, linearY, monotoneSlopes, niceTicks, rebase, runs, seriesPaths, spreadLabels, toIndex, weekScale } from "./chart";

describe("chart", () => {
  it("niceTicks: 1·2·5 간격, 범위를 감싼다", () => {
    expect(niceTicks(6.5, 27.75, 5)).toEqual([5, 10, 15, 20, 25, 30]);
    expect(niceTicks(28.8, 53.7, 4)).toEqual([20, 30, 40, 50, 60]);
    expect(niceTicks(0, 622, 4)).toEqual([0, 200, 400, 600, 800]);
    expect(niceTicks(5, 5)).toEqual([4, 4.5, 5, 5.5, 6]);
  });

  it("runs: null로 끊긴 구간", () => {
    expect(runs([1, 2, null, 3, null, null, 4, 5])).toEqual([[0, 1], [3, 3], [6, 7]]);
    expect(runs([null, null])).toEqual([]);
  });

  it("monotoneSlopes: 극값에서 기울기 0 (넘침 없음)", () => {
    const t = monotoneSlopes([[0, 0], [1, 10], [2, 0]]);
    expect(t[1]).toBe(0);
  });

  it("toIndex: 첫 거래 3개월 평균 = 100, 빈 달은 건너뜀", () => {
    const a = toIndex([null, 90, 100, 110, 150]);
    expect(a[0]).toBeNull();
    [90, 100, 110, 150].forEach((v, i) => expect(a[i + 1]).toBeCloseTo(v, 9));
    const b = toIndex([100, 200]);
    expect(b[0]).toBeCloseTo(200 / 3, 9);
    expect(b[1]).toBeCloseTo(400 / 3, 9);
    expect(toIndex([null, null])).toEqual([null, null]);
  });

  it("spreadLabels: 겹치는 라벨을 간격만큼 벌리고 순서·범위 유지", () => {
    expect(spreadLabels([100, 105, 300], 20, 0, 400)).toEqual([100, 120, 300]);
    // 원래 순서가 아닌 입력도 y 순서 기준으로 벌린다
    expect(spreadLabels([105, 100], 20, 0, 400)).toEqual([120, 100]);
    // 아래 끝에 몰리면 위로 밀어 올린다
    expect(spreadLabels([395, 398, 399], 20, 0, 400)).toEqual([360, 380, 400]);
  });

  it("seriesPaths: 집계 중 구간은 점선, 확정 구간과 한 점 겹침", () => {
    const x = (i: number) => i * 10, y = (v: number) => v;
    const p = seriesPaths([1, 2, 3, 4], x, y, 100, 2);
    expect(p.solid.startsWith("M0.0 1.0")).toBe(true);
    expect(p.solid.endsWith("20.0 3.0")).toBe(true);
    expect(p.dashed.startsWith("M20.0 3.0")).toBe(true);
    expect(p.area).toContain("L30.0 100.0 L0.0 100.0 Z");
    const all = seriesPaths([1, 2], x, y, 100, 10);
    expect(all.dashed).toBe("");
  });
});

describe("주간 차트", () => {
  // 2025-12-01 ~ 2026-02-23 매주 월요일 13주
  const weeks = Array.from({ length: 13 }, (_, k) => new Date(Date.UTC(2025, 11, 1 + 7 * k)).toISOString().slice(0, 10));

  it("weekScale: 달이 바뀐 첫 주에 눈금, 1월 첫 주에 연도 구분", () => {
    const s = weekScale(weeks, 1000, 10, 66);
    expect(weeks[s.jans[0]]).toBe("2026-01-05");
    expect(s.xTicks.map((t) => weeks[t.i])).toEqual(["2026-01-05", "2026-02-02"]);
    expect(s.xTicks[0].label).toBe("1월");
    expect(s.X(0)).toBe(10);
    expect(s.X(12)).toBe(1000 - 66);
    expect(s.yearLabels.map((y) => y.label)).toEqual(["2025", "2026"]);
  });

  it("weekScale: 좁으면 눈금 간격을 늘리고 연.월 라벨", () => {
    const long = Array.from({ length: 262 }, (_, k) => new Date(Date.UTC(2021, 8, 20 + 7 * k)).toISOString().slice(0, 10));
    const s = weekScale(long, 360, 12, 46);
    expect(s.xTicks.every((t) => /^\d\d\.\d\d$/.test(t.label))).toBe(true);
    const gaps = s.xTicks.slice(1).map((t, k) => s.X(t.i) - s.X(s.xTicks[k].i));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(40);
  });

  it("changePct·rebase", () => {
    expect(changePct([100, 101, null, 102], 1)).toBeCloseTo(1);
    expect(changePct([100, 101, null, 102], 3)).toBeNull();
    expect(changePct([100, 101, 102, 104], 3, 3)).toBeCloseTo(4);
    expect(changePct([100], 0)).toBeNull();
    const r = rebase([null, 50, 55, null]);
    expect(r[0]).toBeNull();
    expect(r[1]).toBe(100);
    expect(r[2]).toBeCloseTo(110);
    expect(r[3]).toBeNull();
  });
});

describe("linearY", () => {
  it("눈금 아래 끝 = 높이 − 아래 여백, 위 끝 = 위 여백", () => {
    const y = linearY([0, 50, 100], 24, 320, 4);
    expect(y(0)).toBe(316);
    expect(y(100)).toBe(24);
    expect(y(50)).toBe(170);
    // 기존 식과 같은 값
    const t = [2.5, 3, 3.5], T = 22, H = 180, B = 6;
    for (const v of [2.5, 2.75, 3.1, 3.5]) expect(linearY(t, T, H, B)(v)).toBe(T + (H - T - B) * (1 - (v - t[0]) / (t[t.length - 1] - t[0])));
  });
});

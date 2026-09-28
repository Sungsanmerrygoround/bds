import { describe, expect, it } from "vitest";
import { monotoneSlopes, niceTicks, runs, seriesPaths } from "./chart";

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

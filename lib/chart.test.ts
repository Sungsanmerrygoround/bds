import { describe, expect, it } from "vitest";
import { monotoneSlopes, niceTicks, runs, seriesPaths, spreadLabels, toIndex } from "./chart";

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

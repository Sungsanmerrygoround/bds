import { describe, expect, it } from "vitest";
import { relocationByGroup, supplyByGroup, supplyReactions } from "./supply";

const months = Array.from({ length: 10 }, (_, i) => `2025${String(i + 1).padStart(2, "0")}`);

describe("supplyByGroup", () => {
  it("그룹·월별 합계, 제외 공고와 이주 제외, 보정값 우선", () => {
    const r2g = new Map([[1, 10], [2, 10], [3, 20]]);
    const out = supplyByGroup(
      r2g,
      months,
      [
        { region_id: 1, move_in_ym: "202503", households: 100, total_households_override: null, is_excluded: false },
        { region_id: 2, move_in_ym: "202503", households: 50, total_households_override: 300, is_excluded: false },
        { region_id: 1, move_in_ym: "202504", households: 999, total_households_override: null, is_excluded: true },
        { region_id: 1, move_in_ym: "203001", households: 1, total_households_override: null, is_excluded: false },
      ],
      [
        { region_id: 3, ym: "202505", households: 70, kind: "입주" },
        { region_id: 3, ym: "202506", households: 80, kind: "이주" },
      ],
    );
    expect(out.get(10)![2]).toBe(400);
    expect(out.get(10)![3]).toBe(0);
    expect(out.get(20)!.reduce((a, b) => a + b, 0)).toBe(70);
  });

  it("공고가 없는 그룹도 0으로 채운다", () => {
    const out = supplyByGroup(new Map([[1, 10], [3, 20]]), months, [], []);
    expect([...out.keys()].sort()).toEqual([10, 20]);
    expect(out.get(20)).toEqual(months.map(() => 0));
  });
});

describe("relocationByGroup", () => {
  it("직접 입력한 이주만 그룹·월별로 합산 (입주·기간 밖·모르는 지역 제외)", () => {
    const out = relocationByGroup(new Map([[1, 10], [2, 10], [3, 20]]), months, [
      { region_id: 1, ym: "202506", households: 800, kind: "이주" },
      { region_id: 2, ym: "202506", households: 200, kind: "이주" },
      { region_id: 3, ym: "202505", households: 70, kind: "입주" },
      { region_id: 1, ym: "203001", households: 5, kind: "이주" },
      { region_id: 9, ym: "202506", households: 5, kind: "이주" },
    ]);
    expect(out.get(10)![5]).toBe(1000);
    expect(out.get(10)!.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(out.get(20)).toEqual(months.map(() => 0));
  });
});

describe("supplyReactions", () => {
  it("입주 4~6개월 전 평균 대비 입주 전월~익월 평균, 다른 지역 평균을 뺀 초과 변화", () => {
    const supply = new Map([[1, [0, 0, 0, 0, 0, 0, 0, 800, 0, 0]], [2, months.map(() => 0)]]);
    const jeonse = new Map<number, (number | null)[]>([
      // 입주 인덱스 7: 비교 전 = 1~3, 입주 전후 = 6~8
      [1, [100, 100, 100, 100, 100, 100, 90, 90, 90, 90]],
      [2, [100, 100, 100, 100, 100, 100, 99, 99, 99, 99]],
    ]);
    const r = supplyReactions(months, supply, jeonse, 9);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ groupId: 1, ym: "202508", households: 800 });
    expect(r[0].change).toBeCloseTo(-10);
    expect(r[0].others).toBeCloseTo(-1);
    expect(r[0].excess).toBeCloseTo(-9);
  });

  it("창이 집계 끝난 달을 넘거나 문턱 미만이면 제외", () => {
    const supply = new Map([[1, [0, 0, 0, 0, 0, 0, 0, 800, 0, 0]]]);
    const jeonse = new Map<number, (number | null)[]>([[1, months.map(() => 100)]]);
    expect(supplyReactions(months, supply, jeonse, 7)).toEqual([]);
    expect(supplyReactions(months, supply, jeonse, 9, 1000)).toEqual([]);
  });
});

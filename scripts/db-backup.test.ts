import { describe, expect, it } from "vitest";
import { compareCounts, fkOrder, type Manifest } from "./db-backup";

describe("fkOrder", () => {
  it("참조되는 표가 먼저, 자기 참조·순환은 무시, 결과는 결정적", () => {
    const refs = [
      { from: "events", to: "apt_trades" }, { from: "events", to: "complexes" },
      { from: "apt_trades", to: "complexes" }, { from: "complexes", to: "regions" }, { from: "regions", to: "region_groups" },
      { from: "a", to: "a" }, { from: "x", to: "y" }, { from: "y", to: "x" },
    ];
    const order = fkOrder(["events", "apt_trades", "complexes", "regions", "region_groups", "settings", "a", "x", "y"], refs);
    const pos = (t: string) => order.indexOf(t);
    expect(order).toHaveLength(9);
    expect(pos("region_groups")).toBeLessThan(pos("regions"));
    expect(pos("regions")).toBeLessThan(pos("complexes"));
    expect(pos("complexes")).toBeLessThan(pos("apt_trades"));
    expect(pos("apt_trades")).toBeLessThan(pos("events"));
  });
  it("목록에 없는 표를 가리키는 외래키는 무시", () => {
    expect(fkOrder(["b"], [{ from: "b", to: "missing" }])).toEqual(["b"]);
  });
});

describe("compareCounts", () => {
  it("행 수가 다른 표만", () => {
    const m: Manifest = { created_at: "", with_raw: false, migrations: [], tables: [
      { name: "a", columns: [], rows: 3, serial: null }, { name: "b", columns: [], rows: 2, serial: "id" },
    ] };
    expect(compareCounts(m, new Map([["a", 3], ["b", 2]]))).toEqual([]);
    expect(compareCounts(m, new Map([["a", 3]]))).toEqual(["b: 백업 2행, 복원 없음"]);
  });
});

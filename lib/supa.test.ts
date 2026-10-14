import { describe, expect, it, vi } from "vitest";
import { check, selectAll } from "./supa";

describe("check", () => {
  it("오류면 무엇을 하다 났는지 붙여 던지고, 아니면 data", () => {
    expect(check({ data: [1], error: null }, "x")).toEqual([1]);
    expect(() => check({ data: null, error: { message: "boom" } }, "apt_trades")).toThrow("apt_trades: boom");
  });
});

describe("selectAll", () => {
  it("1000행씩 받아 마지막 페이지(1000행 미만)에서 멈춘다", async () => {
    const total = 2345;
    const build = vi.fn(async (from: number, to: number) => ({
      data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, k) => from + k),
      error: null,
    }));
    const rows = await selectAll<number>(build, "t");
    expect(rows).toHaveLength(total);
    expect(rows.at(-1)).toBe(total - 1);
    expect(build.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("딱 1000의 배수면 빈 페이지 한 번 더 확인", async () => {
    const build = vi.fn(async (from: number) => ({ data: from < 1000 ? Array(1000).fill(0) : [], error: null }));
    expect(await selectAll(build, "t")).toHaveLength(1000);
    expect(build).toHaveBeenCalledTimes(2);
  });
  it("data가 null이면 빈 배열, 오류는 던짐", async () => {
    expect(await selectAll(async () => ({ data: null, error: null }), "t")).toEqual([]);
    await expect(selectAll(async () => ({ data: null, error: { message: "e" } }), "t")).rejects.toThrow("t: e");
  });
});

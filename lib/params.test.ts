import { describe, expect, it } from "vitest";
import { findGroup, paramStr } from "./params";

describe("params", () => {
  it("paramStr: 문자열 하나만", () => {
    expect(paramStr("a")).toBe("a");
    expect(paramStr(["a", "b"])).toBeUndefined();
    expect(paramStr(undefined)).toBeUndefined();
  });
  it("findGroup: id 문자열 비교, 배열·모르는 값은 없음", () => {
    const gs = [{ id: 1, name: "영통" }, { id: 4, name: "강동" }];
    expect(findGroup(gs, "4")?.name).toBe("강동");
    expect(findGroup(gs, "9")).toBeUndefined();
    expect(findGroup(gs, ["4"])).toBeUndefined();
    expect(findGroup(gs, undefined)).toBeUndefined();
  });
});

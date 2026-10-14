import { describe, expect, it } from "vitest";
import { findGroup, groupOptions, groupValue, isAptSeq, paramStr, safeDecode } from "./params";

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

describe("지역 선택지 · 단지 코드", () => {
  it("groupOptions / groupValue", () => {
    expect(groupOptions([{ id: 1, name: "영통" }, { id: 4, name: "강동" }])).toEqual([
      { value: "all", label: "전체" }, { value: "1", label: "영통" }, { value: "4", label: "강동" },
    ]);
    expect(groupValue(4)).toBe("4");
    expect(groupValue(null)).toBe("all");
    expect(groupValue(undefined)).toBe("all");
  });
  it("isAptSeq", () => {
    expect(isAptSeq("11740-4692")).toBe(true);
    expect(isAptSeq("41117-49")).toBe(true);
    expect(isAptSeq("")).toBe(false);
    expect(isAptSeq("a b")).toBe(false);
    expect(isAptSeq("x".repeat(33))).toBe(false);
    expect(isAptSeq("11740,4692")).toBe(false);
  });
  it("safeDecode: 잘못된 % 인코딩은 null", () => {
    expect(safeDecode("11740-4692")).toBe("11740-4692");
    expect(safeDecode("a%20b")).toBe("a b");
    expect(safeDecode("%E0%A4")).toBeNull();
    expect(safeDecode("abc%")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { findGroup, findOption, groupLabel, groupOptions, groupValue, isAptSeq, pageIndex, paramStr, safeDecode, withParam } from "./params";

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
  it("findOption: 같은 value의 선택지, 배열·모르는 값·없음은 undefined", () => {
    const opts = [{ value: "1", label: "하나" }, { value: "3", label: "셋" }];
    expect(findOption(opts, "3")?.label).toBe("셋");
    expect(findOption(opts, "2")).toBeUndefined();
    expect(findOption(opts, ["3"])).toBeUndefined();
    expect(findOption(opts, undefined)).toBeUndefined();
  });
  it("groupLabel: 그룹이 없으면 전체 지역", () => {
    expect(groupLabel({ name: "영통" })).toBe("영통");
    expect(groupLabel(null)).toBe("전체 지역");
    expect(groupLabel(undefined)).toBe("전체 지역");
  });
  it("safeDecode: 잘못된 % 인코딩은 null", () => {
    expect(safeDecode("11740-4692")).toBe("11740-4692");
    expect(safeDecode("a%20b")).toBe("a b");
    expect(safeDecode("%E0%A4")).toBeNull();
    expect(safeDecode("abc%")).toBeNull();
  });
});

describe("쪽 번호", () => {
  it("pageIndex: ?p=1이 첫 쪽(0), 잘못된 값은 0", () => {
    expect([pageIndex(undefined), pageIndex("1"), pageIndex("3"), pageIndex("0"), pageIndex("x"), pageIndex("1.5"), pageIndex(["2"])]).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });
  it("withParam: 다른 파라미터는 두고 하나만 바꾸거나 지운다", () => {
    expect(withParam("/events", { m: "3", p: "2" }, "p", "3")).toBe("/events?m=3&p=3");
    expect(withParam("/events", { m: "3", p: "2" }, "p", null)).toBe("/events?m=3");
    expect(withParam("/events", { p: "2", x: ["a", "b"] }, "p", null)).toBe("/events");
  });
});

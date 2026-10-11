import { describe, expect, it } from "vitest";
import { parseEcos } from "./ecos";
import { FatalApiError } from "./http";

// 2026-10-11 실제 응답에서 필요한 필드만 줄인 것
const OK = JSON.stringify({
  StatisticSearch: {
    list_total_count: 3,
    row: [
      { STAT_CODE: "722Y001", ITEM_CODE1: "0101000", UNIT_NAME: "연%", TIME: "202607", DATA_VALUE: "2.75" },
      { STAT_CODE: "722Y001", ITEM_CODE1: "0101000", UNIT_NAME: "연%", TIME: "202608", DATA_VALUE: "3" },
      { STAT_CODE: "722Y001", ITEM_CODE1: "0101000", UNIT_NAME: "연%", TIME: "202609", DATA_VALUE: "" },
    ],
  },
});

describe("parseEcos", () => {
  it("월·값을 숫자로, 빈 값은 건너뛴다", () => {
    expect(parseEcos(OK)).toEqual([{ ym: "202607", value: 2.75 }, { ym: "202608", value: 3 }]);
  });
  it("데이터 없음(INFO-200)은 빈 배열", () => {
    expect(parseEcos('{"RESULT":{"CODE":"INFO-200","MESSAGE":"해당하는 데이터가 없습니다."}}')).toEqual([]);
  });
  it("키 오류(INFO-100)는 재시도하지 않는 오류", () => {
    expect(() => parseEcos('{"RESULT":{"CODE":"INFO-100","MESSAGE":"인증키가 유효하지 않습니다."}}')).toThrow(FatalApiError);
  });
  it("일시 오류(ERROR-500)는 재시도 가능한 일반 오류", () => {
    try {
      parseEcos('{"RESULT":{"CODE":"ERROR-500","MESSAGE":"서버 오류"}}');
      expect.unreachable();
    } catch (e) {
      expect(e).not.toBeInstanceOf(FatalApiError);
    }
  });
  it("JSON이 아니면 오류", () => {
    expect(() => parseEcos("<html>")).toThrow(/파싱 실패/);
  });
});

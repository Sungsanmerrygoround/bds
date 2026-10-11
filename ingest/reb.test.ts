import { describe, expect, it } from "vitest";
import { FatalApiError } from "./http";
import { parseReb } from "./reb";

// 2026-10-11 실제 응답에서 필요한 필드만 줄인 것 (송파구 매매가격지수)
const OK = JSON.stringify({
  SttsApiTblData: [
    { head: [{ list_total_count: 3 }, { RESULT: { CODE: "INFO-000", MESSAGE: "정상 처리되었습니다." } }] },
    {
      row: [
        { WRTTIME_IDTFR_ID: "202638", WRTTIME_DESC: "2026-09-14", CLS_ID: 50069, ITM_ID: 10001, DTA_VAL: 101.145003401094 },
        { WRTTIME_IDTFR_ID: "202639", WRTTIME_DESC: "2026-09-21", CLS_ID: 50069, ITM_ID: 10001, DTA_VAL: null },
        { WRTTIME_IDTFR_ID: "202641", WRTTIME_DESC: "2026-10-05", CLS_ID: 50069, ITM_ID: 10001, DTA_VAL: "100.624041593038" },
      ],
    },
  ],
});

describe("parseReb", () => {
  it("주(월요일 날짜)·값, 빈 값은 건너뛰고 전체 건수는 head에서", () => {
    expect(parseReb(OK)).toEqual({
      rows: [{ week: "2026-09-14", value: 101.145003401094 }, { week: "2026-10-05", value: 100.624041593038 }],
      total: 3,
    });
  });
  it("데이터 없음(INFO-200)은 빈 결과", () => {
    expect(parseReb('{"RESULT":{"CODE":"INFO-200","MESSAGE":"해당하는 데이터가 없습니다."}}')).toEqual({ rows: [], total: 0 });
  });
  it("키 오류(ERROR-290)는 재시도하지 않는 오류", () => {
    expect(() => parseReb('{"RESULT":{"CODE":"ERROR-290","MESSAGE":"인증키가 유효하지 않습니다."}}')).toThrow(FatalApiError);
  });
  it("그 밖의 오류는 재시도 가능한 일반 오류", () => {
    try {
      parseReb('{"RESULT":{"CODE":"ERROR-500","MESSAGE":"서버 오류"}}');
      expect.unreachable();
    } catch (e) {
      expect(e).not.toBeInstanceOf(FatalApiError);
    }
  });
  it("JSON이 아니면 오류", () => {
    expect(() => parseReb("<html>")).toThrow(/파싱 실패/);
  });
});

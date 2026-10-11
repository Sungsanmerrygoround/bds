import { describe, expect, it } from "vitest";
import { FatalApiError } from "./http";
import {
  jibunFromAddr, matchComplexes, nameScore, normJibun, normName, parseKapt, toBasis, toListItem, toParking,
  type KaptCandidate, type OurComplex,
} from "./kapt";

// 2026-10-11 실제 응답에서 필요한 필드만 줄인 것
const LIST = JSON.stringify({
  response: {
    body: {
      items: [
        { kaptCode: "A44337202", kaptName: "매탄극동", bjdCode: "4111710100", as1: "경기도", as2: "수원영통구", as3: "매탄동", as4: null },
        { kaptCode: "A44370903", kaptName: "매탄주공5단지", bjdCode: "4111710100", as1: "경기도", as2: "수원영통구", as3: "매탄동", as4: null },
      ],
      numOfRows: 2, pageNo: 1, totalCount: 138,
    },
    header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
  },
});
const BASIS = {
  kaptCode: "A44337202", kaptName: "매탄극동", kaptAddr: "경기도 수원영통구 매탄동 50 매탄극동", codeHeatNm: "개별난방",
  kaptDongCnt: "6", kaptdaCnt: 210.0, doroJuso: "경기도 수원시 영통구 매봉로27번길 11", kaptUsedate: "19981030",
  bjdCode: "4111710100", kaptTopFloor: 10,
};

describe("K-apt 응답", () => {
  it("목록: items 배열, 총 건수", () => {
    const r = parseKapt(LIST);
    expect(r.totalCount).toBe(138);
    expect(r.items.map(toListItem)).toEqual([
      { kaptCode: "A44337202", kaptName: "매탄극동", bjdCode: "4111710100", dong: "매탄동" },
      { kaptCode: "A44370903", kaptName: "매탄주공5단지", bjdCode: "4111710100", dong: "매탄동" },
    ]);
  });
  it("기본정보: 1건 item 객체, 숫자·날짜 변환", () => {
    const r = parseKapt(JSON.stringify({ response: { body: { item: BASIS }, header: { resultCode: "00" } } }));
    expect(toBasis(r.items[0])).toEqual({
      kaptCode: "A44337202", kaptName: "매탄극동", kaptAddr: "경기도 수원영통구 매탄동 50 매탄극동", bjdCode: "4111710100",
      households: 210, dongCount: 6, topFloor: 10, useDate: "1998-10-30", heatType: "개별난방", roadAddr: "경기도 수원시 영통구 매봉로27번길 11",
    });
  });
  it("없는 단지코드: 값이 모두 null인 item → null", () => {
    expect(toBasis({ kaptCode: null, kaptName: null, kaptdaCnt: null })).toBeNull();
  });
  it("주차: 지상+지하, 둘 다 없으면 null", () => {
    expect(toParking({ kaptdPcnt: "81", kaptdPcntu: "172" })).toBe(253);
    expect(toParking({ kaptdPcnt: "81", kaptdPcntu: null })).toBe(81);
    expect(toParking({ kaptdPcnt: null, kaptdPcntu: "" })).toBeNull();
  });
  it("게이트웨이 오류(JSON 04 HTTP_ERROR)는 재시도 가능한 일반 오류", () => {
    const gw = JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "HTTP_ERROR", returnAuthMsg: "HTTP 에러", returnReasonCode: "04" } } });
    expect(() => parseKapt(gw)).toThrow("K-apt 오류 04: HTTP 에러");
    try { parseKapt(gw); } catch (e) { expect(e).not.toBeInstanceOf(FatalApiError); }
  });
  it("키 오류(XML 30)는 재시도하지 않는 오류", () => {
    const xml = "<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    expect(() => parseKapt(xml)).toThrow(FatalApiError);
  });
});

describe("지번·이름 정규화", () => {
  it("normJibun", () => {
    expect(normJibun("50")).toBe("50");
    expect(normJibun("172-181")).toBe("172-181");
    expect(normJibun("0897-0000")).toBe("897");
    expect(normJibun("산 12-3")).toBe("산12-3");
    expect(normJibun("")).toBeNull();
    expect(normJibun(null)).toBeNull();
  });
  it("jibunFromAddr: 법정동 다음 지번", () => {
    expect(jibunFromAddr("경기도 수원영통구 매탄동 50 매탄극동", "매탄동")).toBe("50");
    expect(jibunFromAddr("서울특별시 송파구 잠실동 187-10 잠실 센트럴파크", "잠실동")).toBe("187-10");
    expect(jibunFromAddr("서울특별시 송파구 신천동 17-6번지 파크리오", "신천동")).toBe("17-6");
    expect(jibunFromAddr("서울특별시 송파구 잠실동 잠실엘스", "잠실동")).toBeNull();
    expect(jibunFromAddr(null, "잠실동")).toBeNull();
  });
  it("normName: 동 이름 접두·아파트·단지/차 표기 정리", () => {
    expect(normName("매탄극동", "매탄동")).toBe("극동");
    expect(normName("매탄주공5단지", "매탄동")).toBe("주공5");
    expect(normName("잠실엘스아파트", "잠실동")).toBe("엘스");
    expect(normName("헬리오시티(가락시영)", "가락동")).toBe("헬리오시티");
    expect(normName("삼성 제3차", "")).toBe("삼성3");
    expect(normName("매탄", "매탄동")).toBe("매탄"); // 접두만 남으면 지우지 않음
  });
  it("nameScore", () => {
    expect(nameScore("극동", "극동")).toBe(1);
    expect(nameScore("레이크", "잠실레이크팰리스")).toBe(0.9);
    expect(nameScore("레이크팰리스", "레이크펠리스")).toBeGreaterThan(0.5);
    expect(nameScore("현대", "삼성")).toBe(0);
    expect(nameScore("현대", "현대2")).toBeLessThan(0.75); // 짧은 이름은 포함 점수 없음
  });
});

describe("matchComplexes", () => {
  const k = (kaptCode: string, kaptName: string, jibun: string | null, bjdCode = "4111710100", dong = "매탄동", useYear: number | null = null): KaptCandidate =>
    ({ kaptCode, kaptName, bjdCode, dong, jibun, useYear });
  const o = (apt_seq: string, apt_nm: string, jibun: string | null, umd_cd: string | null = "10100", umd_nm = "매탄동", build_year: number | null = null): OurComplex =>
    ({ apt_seq, apt_nm, lawd_cd: "41117", umd_cd, umd_nm, jibun, build_year });
  const kapts = [
    k("K1", "매탄극동", "50"),
    k("K4", "매탄주공4단지", "897"),
    k("K5", "매탄주공5단지", "897"),
    k("K9", "매탄위브하늘채", "1351"),
    k("KX", "영통벽적골", "955", "4111710300", "영통동"),
  ];

  it("같은 법정동·지번, 이름이 달라도(극동↔매탄극동) 지번으로", () => {
    expect(matchComplexes([o("A", "극동", "50")], kapts, new Map())).toEqual([{ apt_seq: "A", kaptCode: "K1", method: "jibun", score: 1 }]);
  });
  it("한 지번에 여러 단지: 단지 번호가 맞는 쪽", () => {
    const m = matchComplexes([o("A4", "매탄주공4", "897"), o("A5", "매탄주공5", "897")], kapts, new Map());
    expect(m.map((x) => [x.apt_seq, x.kaptCode])).toEqual([["A4", "K4"], ["A5", "K5"]]);
  });
  it("지번이 다르면 같은 법정동 안 이름으로", () => {
    expect(matchComplexes([o("B", "매탄위브하늘채", "1352")], kapts, new Map())).toMatchObject([{ kaptCode: "K9", method: "name" }]);
  });
  it("umd_cd가 없으면 동 이름으로 법정동코드를 찾는다", () => {
    expect(matchComplexes([o("C", "주공4", "897", null)], kapts, new Map())).toMatchObject([{ kaptCode: "K4", method: "jibun" }]);
  });
  it("다른 법정동·이름이 안 맞으면 짝 없음", () => {
    expect(matchComplexes([o("D", "벽적골", "955"), o("E", "성신", "172-181")], kapts, new Map())).toEqual([]);
  });
  it("재건축: 같은 지번이라도 연도가 3년 넘게 다르면 이름이 똑같을 때만", () => {
    const ks = [k("R1", "매탄르엘", "77", "4111710100", "매탄동", 2025), k("R2", "매탄더샵포레", "88", "4111710100", "매탄동", 2024)];
    expect(matchComplexes([o("M", "미성", "77", "10100", "매탄동", 1980)], ks, new Map())).toEqual([]);
    expect(matchComplexes([o("F", "더샵포레", "88", "10100", "매탄동", 1984)], ks, new Map())).toMatchObject([{ kaptCode: "R2", method: "jibun", score: 1 }]);
    expect(matchComplexes([o("N", "르엘", "77", "10100", "매탄동", 2024)], ks, new Map())).toMatchObject([{ kaptCode: "R1" }]);
  });
  it("짧은 흔한 이름은 포함만으로 짝짓지 않음 (현대2 ↔ 문정현대)", () => {
    const ks = [k("H", "문정현대아파트", "150", "1171010800", "문정동")];
    const ours: OurComplex = { apt_seq: "X", apt_nm: "현대2", lawd_cd: "11710", umd_cd: "10800", umd_nm: "문정동", jibun: "62-5", build_year: null };
    expect(matchComplexes([ours], ks, new Map())).toEqual([]);
  });
  it("수동 보정: 코드 지정 / null이면 짝 없음 확정", () => {
    const ov = new Map<string, string | null>([["A", "K9"], ["B", null]]);
    expect(matchComplexes([o("A", "극동", "50"), o("B", "매탄위브하늘채", "1352")], kapts, ov))
      .toEqual([{ apt_seq: "A", kaptCode: "K9", method: "manual", score: 1 }]);
  });
});

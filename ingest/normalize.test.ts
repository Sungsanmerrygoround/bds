import { describe, expect, it } from "vitest";
import { excludeReason, matchSupplyRegion } from "./applyhome";
import { parseMolitResponse } from "./molit";
import { normalizeRents, normalizeTrades, pickRegion, yyDotDate, type Region } from "./normalize";
import { areaBand } from "../lib/area";

// 2026-09-28 실제 응답(영통구 2026-07)에서 발췌
const trade = (o: Record<string, string | number>) => ({
  aptDong: " ", aptNm: "신나무실신성", aptSeq: "41117-49", buildYear: 1997, buyerGbn: "개인",
  cdealDay: " ", cdealType: " ", dealAmount: "84,400", dealDay: 21, dealMonth: 7, dealYear: 2026,
  dealingGbn: "중개거래", excluUseAr: "84.9", floor: "20", jibun: "963-2", landLeaseholdGbn: "N",
  rgstDate: " ", roadNm: "청명남로", slerGbn: "개인", umdCd: "10500", umdNm: "영통동", ...o,
});

const regions: Region[] = [
  { id: 1, lawd_cd: "41131", include_dongs: [], exclude_dongs: ["창곡동"], supply_address_patterns: ["성남시 수정구"] },
  { id: 2, lawd_cd: "41117", include_dongs: [], exclude_dongs: [], supply_address_patterns: ["수원시 영통구"] },
];

describe("parseMolitResponse", () => {
  it("단건이면 item이 객체로 온다", () => {
    const r = parseMolitResponse(JSON.stringify({
      response: { header: { resultCode: "000" }, body: { items: { item: trade({}) }, totalCount: 1 } },
    }));
    expect(r.items).toHaveLength(1);
  });
  it("0건이면 items가 빈 문자열", () => {
    const r = parseMolitResponse(JSON.stringify({
      response: { header: { resultCode: "000" }, body: { items: "", totalCount: 0 } },
    }));
    expect(r.items).toEqual([]);
  });
  it("키 오류 XML은 재시도하지 않는 오류", () => {
    const xml = "<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
    expect(() => parseMolitResponse(xml)).toThrow(/30/);
  });
});

describe("normalizeTrades", () => {
  it("금액·날짜·해제·직거래를 변환한다", () => {
    const { rows } = normalizeTrades(
      [trade({ cdealType: "O", cdealDay: "26.09.14", dealingGbn: "직거래", rgstDate: "26.09.18" })],
      regions, "41117", "202607",
    );
    expect(rows[0]).toMatchObject({
      price_man: 84400, deal_date: "2026-07-21", exclu_area: 84.9, floor: 20, region_id: 2,
      is_cancelled: true, cancel_date: "2026-09-14", dealing_type: "직거래", rgst_date: "2026-09-18",
      apt_dong: null, land_leasehold: false,
    });
  });

  it("55㎡ 미만은 저장하지 않는다", () => {
    const n = normalizeTrades([trade({ excluUseAr: "49.94" }), trade({ excluUseAr: "54.99" }), trade({ excluUseAr: "55" })], regions, "41117", "202607");
    expect(n.rows).toHaveLength(1);
    expect(n.skipped.small_area).toBe(2);
  });

  it("완전히 같은 거래는 순번으로 구분하고, 해제 여부는 키에 영향 없다", () => {
    const a = normalizeTrades([trade({}), trade({})], regions, "41117", "202607").rows.map((r) => r.trade_key);
    expect(a).toEqual(["41117-49|2026-07-21|20|84.9|84400#1", "41117-49|2026-07-21|20|84.9|84400#2"]);
    const b = normalizeTrades([trade({ cdealType: "O", aptDong: "101" })], regions, "41117", "202607").rows[0].trade_key;
    expect(b).toBe(a[0]);
  });

  it("제외 법정동(창곡동)은 저장하지 않는다", () => {
    const n = normalizeTrades([trade({ umdNm: "창곡동" }), trade({ umdNm: "신흥동" })], regions, "41131", "202607");
    expect(n.rows).toHaveLength(1);
    expect(n.skipped.out_of_region).toBe(1);
  });
});

describe("normalizeRents", () => {
  it("보증금·월세 분리, 갱신요구권", () => {
    const { rows } = normalizeRents([{
      aptNm: "우성", aptSeq: "41117-16", buildYear: 1998, contractTerm: "26.09~28.09", contractType: "갱신",
      dealDay: 14, dealMonth: 8, dealYear: 2026, deposit: "25,000", excluUseAr: "83.82", floor: "1",
      jibun: "164-10", monthlyRent: "0", preDeposit: "23,000", preMonthlyRent: "0", roadnm: "권광로290번길 34-18",
      sggCd: "41117", umdNm: "매탄동", useRRRight: "사용",
    }], regions, "41117", "202608");
    expect(rows[0]).toMatchObject({
      deposit_man: 25000, monthly_rent_man: 0, contract_type: "갱신", use_rr_right: true,
      pre_deposit_man: 23000, rent_key: "41117-16|2026-08-14|1|83.82|25000|0#1",
    });
  });
});

describe("helpers", () => {
  it("yyDotDate", () => {
    expect(yyDotDate("26.09.18")).toBe("2026-09-18");
    expect(yyDotDate(" ")).toBeNull();
  });
  it("include_dongs가 있으면 그 동만", () => {
    const r: Region[] = [{ id: 9, lawd_cd: "11710", include_dongs: ["잠실동"], exclude_dongs: [], supply_address_patterns: [] }];
    expect(pickRegion(r, "11710", "잠실동")?.id).toBe(9);
    expect(pickRegion(r, "11710", "가락동")).toBeNull();
  });
  it("면적 구간 경계", () => {
    expect([54.99, 55, 64.99, 65, 79.99, 80, 89.99, 90, 114.99, 115, 139.99, 140].map(areaBand))
      .toEqual([null, 59, 59, 74, 74, 84, 84, 100, 100, 125, 125, 150]);
  });
});

describe("청약홈", () => {
  it("제외 사유", () => {
    expect(excludeReason({ HOUSE_NM: "위례 A2-7블록 신혼희망타운(공공분양) 잔여세대", HOUSE_SECD_NM: "신혼희망타운" })).toMatch(/잔여/);
    expect(excludeReason({ HOUSE_NM: "시흥하중지구 A-4블록 신혼희망타운(공공분양) 추가입주자모집" })).toMatch(/추가/);
    expect(excludeReason({ HOUSE_NM: "위례 B3블록", HOUSE_SECD_NM: "민간사전청약" })).toBe("사전청약");
    expect(excludeReason({ HOUSE_NM: "제38차 장기전세주택 입주자 모집 공고(85이하)", RENT_SECD_NM: "분양전환 불가임대" })).toMatch(/장기전세/);
    expect(excludeReason({ HOUSE_NM: "x", RENT_SECD_NM: "분양전환 가능임대" })).toMatch(/임대/);
    expect(excludeReason({ HOUSE_NM: "올림픽파크 포레온", HOUSE_SECD_NM: "APT", RENT_SECD_NM: "분양주택" })).toBeNull();
    expect(excludeReason({ HOUSE_NM: "성남고등 행복주택", HOUSE_SECD_NM: "APT", RENT_SECD_NM: "분양전환 불가임대" })).toBeNull();
  });
  it("주소 매칭 + 창곡동 제외", () => {
    expect(matchSupplyRegion(regions, "경기도 성남시 수정구 창곡동 위례택지개발지구 내 A2-7블록")).toBeNull();
    expect(matchSupplyRegion(regions, "경기도 성남시 수정구 산성동 1336번지 일대")?.id).toBe(1);
    expect(matchSupplyRegion(regions, "경기도 수원시 영통구 원천동 333-1")?.id).toBe(2);
  });
});

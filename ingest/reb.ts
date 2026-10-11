// 한국부동산원 R-ONE 주간 아파트 가격지수
// 2026-10-11 확인: 정상은 SttsApiTblData[0].head(건수·RESULT) + [1].row[], 오류·데이터 없음은 최상위 RESULT
//   (ERROR-290 키 오류, INFO-200 데이터 없음). 주차 ID는 YYYYWW, WRTTIME_DESC는 그 주 월요일(YYYY-MM-DD).

import { requireEnv } from "./env";
import { FatalApiError, requestWithRetry, type CallCounter } from "./http";

export const INDEX_TABLES = [
  { kind: "sale", statbl: "T244183132827305", label: "매매가격지수" },
  { kind: "jeonse", statbl: "T247713133046872", label: "전세가격지수" },
] as const;
export type IndexKind = (typeof INDEX_TABLES)[number]["kind"];

/** 보관 시작(2021-10)보다 조금 앞 주부터: 전고점·4주 변동 계산용 */
export const INDEX_START_WEEK = "202139";

export interface IndexPoint {
  week: string; // YYYY-MM-DD (월요일)
  value: number;
}

const PAGE_SIZE = 1000;

export function parseReb(text: string): { rows: IndexPoint[]; total: number } {
  let json: {
    SttsApiTblData?: [{ head: [{ list_total_count: number }, { RESULT: { CODE: string; MESSAGE: string } }] }, { row?: { WRTTIME_DESC: string; DTA_VAL: number | string | null }[] }];
    RESULT?: { CODE: string; MESSAGE: string };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`R-ONE 응답 파싱 실패: ${text.slice(0, 200)}`);
  }
  if (json.RESULT) {
    if (json.RESULT.CODE === "INFO-200") return { rows: [], total: 0 };
    // ERROR-290 키 오류, ERROR-3xx 요청 형식 오류: 재시도 무의미
    const Err = /^ERROR-(290|3\d\d)$/.test(json.RESULT.CODE) ? FatalApiError : Error;
    throw new Err(`R-ONE 오류 ${json.RESULT.CODE}: ${json.RESULT.MESSAGE}`);
  }
  const [h, body] = json.SttsApiTblData ?? [];
  const result = h?.head?.[1]?.RESULT;
  if (result && result.CODE !== "INFO-000") throw new Error(`R-ONE 오류 ${result.CODE}: ${result.MESSAGE}`);
  const rows = (body?.row ?? [])
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.WRTTIME_DESC) && r.DTA_VAL != null && Number.isFinite(Number(r.DTA_VAL)))
    .map((r) => ({ week: r.WRTTIME_DESC, value: Number(r.DTA_VAL) }));
  return { rows, total: Number(h?.head?.[0]?.list_total_count ?? rows.length) };
}

/** 한 지역·한 지수의 startWeek 이후 전체 주 */
export async function fetchIndex(kind: IndexKind, clsId: number, startWeek: string, counter: CallCounter): Promise<IndexPoint[]> {
  const key = requireEnv("REB_API_KEY");
  const t = INDEX_TABLES.find((x) => x.kind === kind)!;
  const all: IndexPoint[] = [];
  for (let page = 1; ; page++) {
    const url =
      `https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?KEY=${encodeURIComponent(key)}&Type=json` +
      `&STATBL_ID=${t.statbl}&DTACYCLE_CD=WK&CLS_ID=${clsId}&START_WRTTIME=${startWeek}&pIndex=${page}&pSize=${PAGE_SIZE}`;
    const { rows, total } = await requestWithRetry(url, parseReb, counter);
    all.push(...rows);
    if (rows.length < PAGE_SIZE || all.length >= total) return all;
  }
}

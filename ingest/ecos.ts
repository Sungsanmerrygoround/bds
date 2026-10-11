// 한국은행 ECOS 통계 (월별 금리)
// 2026-10-11 확인: 정상은 StatisticSearch.row[], 오류·데이터 없음은 RESULT.CODE (INFO-100 키 오류, INFO-200 데이터 없음)

import { requireEnv } from "./env";
import { FatalApiError, requestWithRetry, type CallCounter } from "./http";

export const RATE_SERIES = [
  { series: "base", stat: "722Y001", item: "0101000", label: "기준금리" },
  { series: "mortgage", stat: "121Y006", item: "BECBLA0302", label: "주택담보대출(신규취급액)" },
] as const;
export type RateSeries = (typeof RATE_SERIES)[number]["series"];

export interface RatePoint {
  ym: string;
  value: number;
}

// 재시도해도 소용없는 오류: 키 오류(100), 요청 형식 오류(1xx·3xx 대부분), 호출 한도(602)
const FATAL = /^(INFO-100|ERROR-1\d\d|ERROR-3\d\d|ERROR-602)$/;

export function parseEcos(text: string): RatePoint[] {
  let json: { StatisticSearch?: { row?: { TIME: string; DATA_VALUE: string }[] }; RESULT?: { CODE: string; MESSAGE: string } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`ECOS 응답 파싱 실패: ${text.slice(0, 200)}`);
  }
  if (json.RESULT) {
    if (json.RESULT.CODE === "INFO-200") return []; // 해당 기간 데이터 없음
    const Err = FATAL.test(json.RESULT.CODE) ? FatalApiError : Error;
    throw new Err(`ECOS 오류 ${json.RESULT.CODE}: ${json.RESULT.MESSAGE}`);
  }
  return (json.StatisticSearch?.row ?? [])
    .filter((r) => /^\d{6}$/.test(r.TIME) && r.DATA_VALUE !== "" && Number.isFinite(Number(r.DATA_VALUE)))
    .map((r) => ({ ym: r.TIME, value: Number(r.DATA_VALUE) }));
}

export async function fetchRates(series: RateSeries, from: string, to: string, counter: CallCounter): Promise<RatePoint[]> {
  const key = requireEnv("ECOS_API_KEY");
  const s = RATE_SERIES.find((r) => r.series === series)!;
  const url = `https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(key)}/json/kr/1/1000/${s.stat}/M/${from}/${to}/${s.item}`;
  return requestWithRetry(url, parseEcos, counter);
}

// 국토교통부 아파트 매매(상세)·전월세 실거래가 API
// 응답 구조는 2026-09-28 실제 호출로 확인 (_type=json 지원, items.item은 1건이면 객체, 여러 건이면 배열)

import { requireEnv } from "./env";
import { dataGoKrXmlError, requestWithRetry, type CallCounter } from "./http";

export type Kind = "trade" | "rent";
export type RawItem = Record<string, string | number | null | undefined>;

const BASE = "http://apis.data.go.kr/1613000";
const ENDPOINTS: Record<Kind, string> = {
  trade: `${BASE}/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev`,
  rent: `${BASE}/RTMSDataSvcAptRent/getRTMSDataSvcAptRent`,
};
const PAGE_SIZE = 1000;

export function parseMolitResponse(text: string): { items: RawItem[]; totalCount: number } {
  if (text.trimStart().startsWith("<")) throw dataGoKrXmlError(text, "API 오류");
  const json = JSON.parse(text);
  const header = json?.response?.header;
  if (header?.resultCode !== "000") {
    throw new Error(`API 오류 ${header?.resultCode}: ${header?.resultMsg}`);
  }
  const body = json.response.body ?? {};
  const raw = typeof body.items === "object" && body.items ? body.items.item : undefined;
  const items: RawItem[] = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  return { items, totalCount: Number(body.totalCount ?? 0) };
}

/** 한 시군구·한 달의 전체 거래를 페이지네이션으로 모두 받는다. */
export async function fetchMonth(
  kind: Kind,
  lawdCd: string,
  ym: string,
  counter: CallCounter,
): Promise<RawItem[]> {
  const key = requireEnv("DATA_GO_KR_SERVICE_KEY");
  const all: RawItem[] = [];
  for (let page = 1; ; page++) {
    const url =
      `${ENDPOINTS[kind]}?serviceKey=${encodeURIComponent(key)}` +
      `&LAWD_CD=${lawdCd}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=${PAGE_SIZE}&_type=json`;
    const { items, totalCount } = await requestWithRetry(url, parseMolitResponse, counter);
    all.push(...items);
    if (items.length === 0 || all.length >= totalCount) {
      if (all.length !== totalCount) {
        throw new Error(`${kind} ${lawdCd} ${ym}: 받은 건수 ${all.length} ≠ totalCount ${totalCount}`);
      }
      return all;
    }
  }
}

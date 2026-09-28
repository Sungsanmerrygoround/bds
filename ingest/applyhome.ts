// 한국부동산원 청약홈 분양정보 (APT 분양정보 상세)
// 2026-09-28 확인: 2020-02 모집공고부터 전국 약 2,900건. TOT_SUPLY_HSHLDCO는 분양분(조합원분 제외).

import { requireEnv } from "./env";
import { FatalApiError, requestWithRetry, type CallCounter } from "./http";
import type { Region } from "./normalize";

const URL_BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail";
const PAGE_SIZE = 1000;

export type ApplyhomeItem = Record<string, string | number | null>;

export interface SupplyRow {
  house_manage_no: string;
  pblanc_no: string | null;
  house_nm: string;
  address: string;
  region_id: number;
  house_secd_nm: string | null;
  rent_secd_nm: string | null;
  households: number;
  move_in_ym: string;
  announce_date: string | null;
  pblanc_url: string | null;
  is_excluded: boolean;
  exclude_reason: string | null;
  raw: ApplyhomeItem;
}

function parse(text: string): { data: ApplyhomeItem[]; totalCount: number } {
  let json: { data?: ApplyhomeItem[]; totalCount?: number; code?: number; msg?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`청약홈 응답 파싱 실패: ${text.slice(0, 200)}`);
  }
  if (!Array.isArray(json.data)) {
    // 인증 실패(-4 등)는 재시도 무의미
    const Err = json.code != null && json.code < 0 ? FatalApiError : Error;
    throw new Err(`청약홈 오류 ${json.code}: ${json.msg}`);
  }
  return { data: json.data, totalCount: Number(json.totalCount ?? 0) };
}

export async function fetchAllApplyhome(counter: CallCounter): Promise<ApplyhomeItem[]> {
  const key = requireEnv("DATA_GO_KR_SERVICE_KEY");
  const all: ApplyhomeItem[] = [];
  for (let page = 1; ; page++) {
    const url = `${URL_BASE}?page=${page}&perPage=${PAGE_SIZE}&serviceKey=${encodeURIComponent(key)}`;
    const { data, totalCount } = await requestWithRetry(url, parse, counter);
    all.push(...data);
    if (data.length === 0 || all.length >= totalCount) return all;
  }
}

/** 제외 사유. null이면 입주 물량에 포함. */
export function excludeReason(it: ApplyhomeItem): string | null {
  const name = String(it.HOUSE_NM ?? "");
  if (/잔여|추가\s*(입주자)?\s*모집|추가모집|무순위/.test(name)) return "잔여·추가모집 공고(중복)";
  if (/장기전세/.test(name)) return "장기전세 재공급(기존 주택)";
  if (it.HOUSE_SECD_NM === "민간사전청약") return "사전청약";
  if (it.RENT_SECD_NM === "분양전환 가능임대") return "분양전환 가능 임대";
  return null;
}

/** 주소 패턴으로 region 매칭. 제외 법정동이 주소에 있으면 매칭하지 않는다. */
export function matchSupplyRegion(regions: Region[], address: string): Region | null {
  for (const r of regions) {
    if (!r.supply_address_patterns.some((p) => address.includes(p))) continue;
    if (r.exclude_dongs.some((d) => address.includes(d))) return null;
    if (r.include_dongs.length > 0 && !r.include_dongs.some((d) => address.includes(d))) continue;
    return r;
  }
  return null;
}

export function toSupplyRows(items: ApplyhomeItem[], regions: Region[]): SupplyRow[] {
  const out: SupplyRow[] = [];
  for (const it of items) {
    const address = String(it.HSSPLY_ADRES ?? "");
    const region = matchSupplyRegion(regions, address);
    if (!region) continue;
    const moveIn = String(it.MVN_PREARNGE_YM ?? "");
    if (!/^\d{6}$/.test(moveIn)) continue;
    const reason = excludeReason(it);
    out.push({
      house_manage_no: String(it.HOUSE_MANAGE_NO),
      pblanc_no: it.PBLANC_NO == null ? null : String(it.PBLANC_NO),
      house_nm: String(it.HOUSE_NM ?? ""),
      address,
      region_id: region.id,
      house_secd_nm: (it.HOUSE_SECD_NM as string) ?? null,
      rent_secd_nm: (it.RENT_SECD_NM as string) ?? null,
      households: Number(it.TOT_SUPLY_HSHLDCO ?? 0),
      move_in_ym: moveIn,
      announce_date: (it.RCRIT_PBLANC_DE as string) ?? null,
      pblanc_url: (it.PBLANC_URL as string) ?? null,
      is_excluded: reason != null,
      exclude_reason: reason,
      raw: it,
    });
  }
  return out;
}

// API 원본 행 → DB 행 변환. 순수 함수만 둔다(테스트 대상).

import type { RawItem } from "./molit";

export const MIN_AREA_M2 = 55; // 이 면적 미만은 저장하지 않음

export interface Region {
  id: number;
  lawd_cd: string;
  include_dongs: string[];
  exclude_dongs: string[];
  supply_address_patterns: string[];
}

export interface ComplexRow {
  apt_seq: string;
  region_id: number;
  lawd_cd: string;
  umd_nm: string | null;
  umd_cd: string | null;
  jibun: string | null;
  road_nm: string | null;
  apt_nm: string;
  build_year: number | null;
}

interface DealBase {
  apt_seq: string;
  region_id: number;
  lawd_cd: string;
  deal_ymd: string;
  deal_date: string;
  exclu_area: number;
  floor: number | null;
  raw: RawItem;
}

export interface TradeRow extends DealBase {
  trade_key: string;
  price_man: number;
  apt_dong: string | null;
  dealing_type: "중개" | "직거래" | null;
  is_cancelled: boolean;
  cancel_date: string | null;
  rgst_date: string | null;
  buyer_gbn: string | null;
  seller_gbn: string | null;
  land_leasehold: boolean | null;
}

export interface RentRow extends DealBase {
  rent_key: string;
  deposit_man: number;
  monthly_rent_man: number;
  contract_type: string | null;
  contract_term: string | null;
  use_rr_right: boolean | null;
  pre_deposit_man: number | null;
  pre_monthly_rent_man: number | null;
}

export type SkipReason = "small_area" | "out_of_region";

export interface Normalized<T> {
  rows: T[];
  complexes: ComplexRow[];
  skipped: Record<SkipReason, number>;
}

// ---------- 값 변환 ----------

/** 공백(' ')만 있는 필드는 null로 */
export const str = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
};

/** '43,000' → 43000 */
export const num = (v: unknown): number | null => {
  const t = str(v)?.replace(/,/g, "");
  if (t == null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** '26.09.18' → '2026-09-18' */
export const yyDotDate = (v: unknown): string | null => {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(str(v) ?? "");
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null;
};

const pad2 = (n: unknown) => String(n).trim().padStart(2, "0");

export const dealDate = (it: RawItem): string =>
  `${String(it.dealYear).trim()}-${pad2(it.dealMonth)}-${pad2(it.dealDay)}`;

const yn = (v: unknown): boolean | null => {
  const t = str(v);
  return t === "Y" ? true : t === "N" ? false : null;
};

// ---------- 지역 배정 ----------

/** 같은 lawd_cd의 region 중 법정동 포함/제외 규칙을 만족하는 첫 번째 */
export function pickRegion(regions: Region[], lawdCd: string, dong: string | null): Region | null {
  for (const r of regions) {
    if (r.lawd_cd !== lawdCd) continue;
    if (r.include_dongs.length > 0 && (!dong || !r.include_dongs.includes(dong))) continue;
    if (dong && r.exclude_dongs.includes(dong)) continue;
    return r;
  }
  return null;
}

// ---------- 고유키 ----------

/**
 * API에는 거래 ID가 없다. 신고 후에도 바뀌지 않는 필드로 기본키를 만들고,
 * 완전히 같은 행이 여러 건이면 응답 순서대로 #1, #2 … 를 붙인다.
 * 해제 여부·등기일·동(aptDong)처럼 나중에 채워지거나 바뀌는 필드는 키에서 제외.
 */
export function withOccurrence<T>(rows: T[], baseKey: (r: T) => string): Array<T & { key: string }> {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = baseKey(r);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...r, key: `${base}#${n}` };
  });
}

// ---------- 공통 처리 ----------

function normalizeCommon<T>(
  items: RawItem[],
  regions: Region[],
  lawdCd: string,
  ym: string,
  build: (it: RawItem, base: DealBase) => T,
  isTrade: boolean,
): { rows: T[]; complexes: Map<string, ComplexRow>; skipped: Record<SkipReason, number> } {
  const skipped: Record<SkipReason, number> = { small_area: 0, out_of_region: 0 };
  const complexes = new Map<string, ComplexRow>();
  const rows: T[] = [];

  for (const it of items) {
    const area = num(it.excluUseAr);
    if (area == null || area < MIN_AREA_M2) {
      skipped.small_area++;
      continue;
    }
    const dong = str(it.umdNm);
    const region = pickRegion(regions, lawdCd, dong);
    if (!region) {
      skipped.out_of_region++;
      continue;
    }
    const aptSeq = str(it.aptSeq);
    if (!aptSeq) throw new Error(`aptSeq 없는 행: ${JSON.stringify(it)}`);

    if (!complexes.has(aptSeq)) {
      complexes.set(aptSeq, {
        apt_seq: aptSeq,
        region_id: region.id,
        lawd_cd: lawdCd,
        umd_nm: dong,
        umd_cd: isTrade ? str(it.umdCd) : null, // 전월세 API에는 umdCd가 없음
        jibun: str(it.jibun),
        road_nm: str(isTrade ? it.roadNm : it.roadnm),
        apt_nm: str(it.aptNm) ?? aptSeq,
        build_year: num(it.buildYear),
      });
    }

    rows.push(
      build(it, {
        apt_seq: aptSeq,
        region_id: region.id,
        lawd_cd: lawdCd,
        deal_ymd: ym,
        deal_date: dealDate(it),
        exclu_area: area,
        floor: num(it.floor),
        raw: it,
      }),
    );
  }
  return { rows, complexes, skipped };
}

// ---------- 매매 ----------

export function normalizeTrades(
  items: RawItem[],
  regions: Region[],
  lawdCd: string,
  ym: string,
): Normalized<TradeRow> {
  const { rows, complexes, skipped } = normalizeCommon(
    items,
    regions,
    lawdCd,
    ym,
    (it, base) => {
      const price = num(it.dealAmount);
      if (price == null) throw new Error(`dealAmount 없음: ${JSON.stringify(it)}`);
      const gbn = str(it.dealingGbn);
      return {
        ...base,
        price_man: price,
        apt_dong: str(it.aptDong),
        dealing_type: gbn === "직거래" ? "직거래" : gbn === "중개거래" ? "중개" : null,
        is_cancelled: str(it.cdealType) === "O",
        cancel_date: yyDotDate(it.cdealDay),
        rgst_date: yyDotDate(it.rgstDate),
        buyer_gbn: str(it.buyerGbn),
        seller_gbn: str(it.slerGbn),
        land_leasehold: yn(it.landLeaseholdGbn),
      } as Omit<TradeRow, "trade_key">;
    },
    true,
  );
  const keyed = withOccurrence(rows, (r) =>
    [r.apt_seq, r.deal_date, r.floor ?? "", r.exclu_area, r.price_man].join("|"),
  ).map(({ key, ...r }) => ({ ...r, trade_key: key }) as TradeRow);
  return { rows: keyed, complexes: [...complexes.values()], skipped };
}

// ---------- 전월세 ----------

export function normalizeRents(
  items: RawItem[],
  regions: Region[],
  lawdCd: string,
  ym: string,
): Normalized<RentRow> {
  const { rows, complexes, skipped } = normalizeCommon(
    items,
    regions,
    lawdCd,
    ym,
    (it, base) => {
      const deposit = num(it.deposit);
      if (deposit == null) throw new Error(`deposit 없음: ${JSON.stringify(it)}`);
      return {
        ...base,
        deposit_man: deposit,
        monthly_rent_man: num(it.monthlyRent) ?? 0,
        contract_type: str(it.contractType),
        contract_term: str(it.contractTerm),
        use_rr_right: str(it.useRRRight) === "사용" ? true : null,
        pre_deposit_man: num(it.preDeposit),
        pre_monthly_rent_man: num(it.preMonthlyRent),
      } as Omit<RentRow, "rent_key">;
    },
    false,
  );
  const keyed = withOccurrence(rows, (r) =>
    [r.apt_seq, r.deal_date, r.floor ?? "", r.exclu_area, r.deposit_man, r.monthly_rent_man].join("|"),
  ).map(({ key, ...r }) => ({ ...r, rent_key: key }) as RentRow);
  return { rows: keyed, complexes: [...complexes.values()], skipped };
}

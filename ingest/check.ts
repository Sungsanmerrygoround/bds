// 수집 결과 점검: 수집은 '성공'했는데 데이터가 이상한 경우를 찾는다 (판단만, DB 조회는 jobs/check.ts).
// 실패·지연은 이미 워크플로 실패 메일과 화면 머리글의 '수집 지연'으로 알 수 있다.
import { addMonths } from "../lib/range";
import { median } from "../lib/stats";

export type DealKind = "trade" | "rent";

export interface CheckInput {
  /** 오늘 (KST, YYYY-MM-DD) */
  today: string;
  /** 시군구 코드 → 이름 (메시지용) */
  regionNames: Map<string, string>;
  /** `${kind}|${lawd}|${ym}` → 응답에서 사라지지 않은 거래 수 */
  monthly: Map<string, number>;
  /** 가장 최근 daily 수집 배치의 시군구·달별 기록 */
  lastBatch: { source: string; lawd_cd: string | null; deal_ymd: string | null; error: string | null; marked_missing: number }[];
  /** 부동산원 주간 지수 가장 최근 주 (YYYY-MM-DD), 없으면 null */
  latestIndexWeek: string | null;
  /** 금리 계열별 가장 최근 달 */
  latestRates: { series: string; ym: string | null }[];
}

/**
 * 신고가 끝난 달의 거래 수가 직전 6개월 중위의 이 비율 미만이면 이상.
 * 5년치(시군구·종류·달 541개)로 되짚어 보면 가장 크게 빠진 달이 18.6%(2025-11 규제 직후 실제 급감)였다.
 * API가 한 지역을 빠뜨리면 0에 가까우므로 그보다 낮게 둔다 — 높이면 실제 시장 급감에도 한 달 내내 매일 경고가 간다.
 */
export const DROP_RATIO = 0.15;
/** 직전 6개월 중위가 이보다 작은 시군구·종류는 들쭉날쭉해서 비율 검사를 하지 않는다 */
export const MIN_BASELINE = 20;
/** 한 번의 수집에서 한 시군구·달의 거래가 이만큼 넘게 응답에서 사라지면 이상 (평소엔 0~몇 건) */
export const MISSING_MAX = 10;
/** 지난달 거래가 0건이면 이상으로 보는 날 (월초에는 아직 신고가 적다) */
export const LAST_MONTH_ZERO_FROM_DAY = 10;
/** 주간 지수는 매주 나오므로 이 일수보다 오래되면 이상 */
export const INDEX_STALE_DAYS = 14;
/** 금리는 달마다 나오지만 발표가 늦어 이 개월보다 오래되면 이상 */
export const RATE_STALE_MONTHS = 3;

export const KINDS: DealKind[] = ["trade", "rent"];
const KIND_LABEL: Record<DealKind, string> = { trade: "매매", rent: "전월세" };

export const monthlyKey = (kind: DealKind, lawd: string, ym: string) => `${kind}|${lawd}|${ym}`;

/** 점검에 쓰는 달: 비교 대상(2달 전, 신고 기한 30일이 지나 거의 다 들어온 달)과 그 앞 6개월, 지난달 */
export function checkMonths(today: string) {
  const ym = today.slice(0, 4) + today.slice(5, 7);
  const target = addMonths(ym, -2);
  return { lastMonth: addMonths(ym, -1), target, baseline: [3, 4, 5, 6, 7, 8].map((n) => addMonths(ym, -n)) };
}

/** 이상한 점을 사람이 읽을 문장으로. 비어 있으면 정상 */
export function findAnomalies(input: CheckInput): string[] {
  const out: string[] = [];
  const { lastMonth, target, baseline } = checkMonths(input.today);
  const day = Number(input.today.slice(8, 10));
  const name = (lawd: string | null) => (lawd ? `${input.regionNames.get(lawd) ?? lawd}(${lawd})` : "?");

  for (const lawd of input.regionNames.keys()) {
    for (const kind of KINDS) {
      const count = (ym: string) => input.monthly.get(monthlyKey(kind, lawd, ym)) ?? 0;
      const base = median(baseline.map(count));
      const n = count(target);
      if (base != null && base >= MIN_BASELINE && n < base * DROP_RATIO) {
        out.push(`${name(lawd)} ${KIND_LABEL[kind]} ${target}: ${n}건 — 직전 6개월 중위 ${Math.round(base)}건의 ${Math.round((n / base) * 100)}%`);
      }
      if (day >= LAST_MONTH_ZERO_FROM_DAY && base != null && base >= MIN_BASELINE && count(lastMonth) === 0) {
        out.push(`${name(lawd)} ${KIND_LABEL[kind]} ${lastMonth}: 0건 (${day}일인데 지난달 거래가 하나도 없음)`);
      }
    }
  }

  for (const r of input.lastBatch) {
    const where = `${name(r.lawd_cd)} ${KIND_LABEL[r.source as DealKind] ?? r.source} ${r.deal_ymd ?? ""}`.trimEnd();
    if (r.error?.startsWith("기존 행 20%")) out.push(`${where}: 기존 거래의 20% 이상이 응답에서 사라져 반영을 건너뜀 (API 응답 이상 의심)`);
    else if (r.marked_missing > MISSING_MAX) out.push(`${where}: 한 번에 ${r.marked_missing}건이 응답에서 사라짐`);
  }

  if (!input.latestIndexWeek) out.push("부동산원 주간 지수: 데이터 없음");
  else {
    const age = Math.round((Date.parse(input.today) - Date.parse(input.latestIndexWeek)) / 86_400_000);
    if (age > INDEX_STALE_DAYS) out.push(`부동산원 주간 지수: 가장 최근 주가 ${input.latestIndexWeek} (${age}일 전)`);
  }

  const oldestOk = addMonths(input.today.slice(0, 4) + input.today.slice(5, 7), -RATE_STALE_MONTHS);
  for (const r of input.latestRates) {
    if (!r.ym || r.ym < oldestOk) out.push(`금리 ${r.series}: 가장 최근 달이 ${r.ym ?? "없음"}`);
  }
  return out;
}

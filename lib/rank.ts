// 단지 순위의 파생 지표와 정렬 (순수 함수)
// 1년 변동 = 최근 3개월 중위 ÷ 1년 전 같은 3개월 중위 (양쪽 2건 이상일 때만)
// 최고가 대비 = 최근 3개월 중위(없으면 12개월 중위) ÷ 보관 기간(5년) 최고 거래가
// 회전율 = 단지 전체(모든 면적) 12개월 매매 건수 ÷ 세대수(K-apt). 세대수가 단지 전체라 면적 필터와 관계없이 전체 거래로 계산한다.
// 전세가율·갭 = 같은 면적 구간의 12개월 매매 중위와 12개월 전세 중위(갱신 제외) 비교. 전세가 JEONSE_MIN건 미만이면 내지 않는다.
import type { RankRow } from "./queries";
import { jeonseRatio, pctChange } from "./stats";

export const JEONSE_MIN = 2;
const CHANGE_MIN = 2; // 1년 변동: 양쪽 3개월 표본 최소 건수

export interface Ranked extends RankRow {
  current: number; // 최근 3개월 중위, 최근 거래가 없으면 12개월 중위
  chg: number | null; // 1년 변동 %
  peakRatio: number; // 최고가 대비 %
  turnover: number | null; // 회전율 %
  jeonse: number | null; // 12개월 전세 중위 (표본이 모자라면 null)
  ratio: number | null; // 전세가율 %
  gap: number | null; // 매매 중위 − 전세 중위 (만원)
}

export function deriveRank(r: RankRow): Ranked {
  const current = r.recent_count > 0 ? r.recent_median! : r.median_12m;
  const jeonse = r.jeonse_count_12m >= JEONSE_MIN ? r.jeonse_median_12m : null;
  return {
    ...r,
    current,
    jeonse,
    ratio: jeonseRatio(r.median_12m, jeonse),
    gap: jeonse == null ? null : r.median_12m - jeonse,
    chg: r.recent_count >= CHANGE_MIN && r.year_ago_count >= CHANGE_MIN ? pctChange(r.recent_median, r.year_ago_median) : null,
    peakRatio: (current / r.peak_price) * 100,
    turnover: r.households ? (r.trades_all_12m / r.households) * 100 : null,
  };
}

/** 정렬 키: 큰 값이 위로 (낮은 순·작은 순 정렬은 부호를 뒤집는다) */
const SORT_KEYS = {
  ppa: (r: Ranked) => r.ppa_12m,
  chg: (r: Ranked) => r.chg,
  vol: (r: Ranked) => r.trades_12m,
  peak: (r: Ranked) => -r.peakRatio,
  ratio: (r: Ranked) => r.ratio,
  gap: (r: Ranked) => (r.gap == null ? null : -r.gap),
} satisfies Record<string, (r: Ranked) => number | null>;

export type RankSort = keyof typeof SORT_KEYS;

/** 정렬 키 순(값이 없는 단지는 뒤로), 같으면 12개월 거래가 많은 순. 원본 배열을 바꾼다. */
export function sortRanked(rows: Ranked[], sort: RankSort): Ranked[] {
  const k = SORT_KEYS[sort];
  return rows.sort((a, b) => (k(b) ?? -Infinity) - (k(a) ?? -Infinity) || b.trades_12m - a.trades_12m);
}

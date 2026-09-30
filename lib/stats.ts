// 화면 계산용 순수 함수: 중위값, 이동평균, 전고점 대비, 단지 이동 중위가, 미등기 판단

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** k개월 이동평균. 창 안 값이 과반(k=3이면 2개) 이상일 때만 값이 있다. */
export function movingAvg(values: (number | null)[], k = 3): (number | null)[] {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - k + 1), i + 1).filter((v): v is number => v != null);
    return i >= k - 1 && win.length * 2 > k ? win.reduce((a, b) => a + b, 0) / win.length : null;
  });
}

export interface PeakInfo {
  peakYm: string;
  peak: number;
  nowYm: string;
  now: number;
  /** 현재 ÷ 전고점 × 100 */
  ratio: number;
}

/**
 * 전고점 대비: 월별 중위가의 3개월 이동평균으로 고점과 현재를 잡는다(한 달 튀는 값에 덜 흔들림).
 * 집계 중인 달(lastDoneYm 이후)은 쓰지 않는다.
 */
export function peakRecovery(months: string[], values: (number | null)[], lastDoneYm: string): PeakInfo | null {
  const done = months.findLastIndex((m) => m <= lastDoneYm);
  if (done < 0) return null;
  const ma = movingAvg(values.slice(0, done + 1));
  const nowIdx = ma.findLastIndex((v) => v != null);
  if (nowIdx < 0) return null;
  let peakIdx = nowIdx;
  ma.forEach((v, i) => {
    if (v != null && v > ma[peakIdx]!) peakIdx = i;
  });
  const peak = ma[peakIdx]!, now = ma[nowIdx]!;
  return { peakYm: months[peakIdx], peak, nowYm: months[nowIdx], now, ratio: (now / peak) * 100 };
}

/**
 * 단지 월별 가격: 달마다 그 달 포함 최근 window개월 거래를 모아 중위값 (단지는 한 달 거래가 적다).
 * 창 안에 거래가 없으면 null.
 */
export function rollingMedian(months: string[], deals: { ym: string; price: number }[], window = 3): (number | null)[] {
  const byYm = new Map<string, number[]>();
  for (const d of deals) byYm.set(d.ym, [...(byYm.get(d.ym) ?? []), d.price]);
  return months.map((_, i) => median(months.slice(Math.max(0, i - window + 1), i + 1).flatMap((m) => byYm.get(m) ?? [])));
}

/** 계약 후 이 일수가 지나도 등기일이 없으면 '미등기'로 표시 (잔금이 길면 정상일 수 있어 넉넉히 잡음) */
export const UNREGISTERED_DAYS = 180;

export function isUnregistered(t: { deal_date: string; rgst_date: string | null; is_cancelled: boolean }, today: string): boolean {
  if (t.rgst_date || t.is_cancelled) return false;
  return (Date.parse(today) - Date.parse(t.deal_date)) / 86_400_000 > UNREGISTERED_DAYS;
}

/** a/b − 1 (%). 둘 중 하나가 없으면 null */
export const pctChange = (a: number | null | undefined, b: number | null | undefined) => (a != null && b ? (a / b - 1) * 100 : null);

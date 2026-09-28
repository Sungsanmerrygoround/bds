// 면적 구간. supabase/migrations의 area_band() SQL 함수와 동일해야 한다 (lib/area.test.ts로 검증).

export const AREA_BANDS = [59, 74, 84, 100, 125, 150] as const;
export type AreaBand = (typeof AREA_BANDS)[number];

export const AREA_BAND_LABEL: Record<AreaBand, string> = {
  59: "59 (55~64㎡)",
  74: "74 (65~79㎡)",
  84: "84 (80~89㎡)",
  100: "100 (90~114㎡)",
  125: "125 (115~139㎡)",
  150: "150 (140㎡~)",
};

export function areaBand(a: number): AreaBand | null {
  if (a < 55) return null;
  if (a < 65) return 59;
  if (a < 80) return 74;
  if (a < 90) return 84;
  if (a < 115) return 100;
  if (a < 140) return 125;
  return 150;
}

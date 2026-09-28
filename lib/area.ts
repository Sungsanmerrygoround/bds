// 면적 구간. supabase/migrations의 area_band() SQL 함수와 동일해야 한다 (supabase/migrations.test.ts로 검증).

export const AREA_BANDS = [59, 74, 84, 100, 125, 150] as const;
export type AreaBand = (typeof AREA_BANDS)[number];

/** 구간이 덮는 전용면적 범위 */
export const AREA_BAND_RANGE: Record<AreaBand, string> = {
  59: "55–64㎡",
  74: "65–79㎡",
  84: "80–89㎡",
  100: "90–114㎡",
  125: "115–139㎡",
  150: "140㎡–",
};

export const AREA_BAND_LABEL: Record<AreaBand, string> = Object.fromEntries(
  AREA_BANDS.map((b) => [b, `${b} (${AREA_BAND_RANGE[b]})`]),
) as Record<AreaBand, string>;

export const DEFAULT_BAND: AreaBand = 84;

export function areaBand(a: number): AreaBand | null {
  if (a < 55) return null;
  if (a < 65) return 59;
  if (a < 80) return 74;
  if (a < 90) return 84;
  if (a < 115) return 100;
  if (a < 140) return 125;
  return 150;
}

/** URL의 band 값 → 구간. 없으면 기본(84), "all"이나 모르는 값이면 전체(null) */
export function parseBand(v: string | string[] | undefined): AreaBand | null {
  if (typeof v !== "string") return DEFAULT_BAND;
  return AREA_BANDS.find((b) => String(b) === v) ?? null;
}

/** 필터 목록용 선택지 (전체 + 구간별) */
export const BAND_OPTIONS = [
  { value: "all", label: "전체" },
  ...AREA_BANDS.map((b) => ({ value: String(b), label: String(b), aside: AREA_BAND_RANGE[b] })),
];

export const bandValue = (band: AreaBand | null) => (band == null ? "all" : String(band));
export const bandText = (band: AreaBand | null) => (band == null ? "전체 면적" : `${band}㎡`);

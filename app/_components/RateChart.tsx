import { MetricChart } from "./MetricChart";
import { getRates, type RateRow } from "@/lib/queries";
import { byMonth } from "@/lib/range";

// 금리 차트 (한국은행 ECOS, 전국·월별). 추이·전세 갱신 화면에서 같은 기간으로 쓴다.
// 기준금리와 주담대 금리는 같은 단위(연 %)라 한 차트에 둔다.

/** 한 금리 계열의 월별 값 (months와 같은 길이, 없는 달은 null) */
export function rateValues(rows: RateRow[], series: RateRow["series"], months: string[]): (number | null)[] {
  return byMonth(months, rows.filter((r) => r.series === series), (r) => r.value);
}

export async function RateChart({ months }: { months: string[] }) {
  const rows = await getRates(months[0], months.at(-1)!);
  const base = rateValues(rows, "base", months), mortgage = rateValues(rows, "mortgage", months);
  // 아직 발표 전인 달: 두 계열 모두 값이 없는 끝부분
  const lastIdx = months.findLastIndex((_, i) => base[i] != null || mortgage[i] != null);
  // 처음엔 두 값이 모두 있는 마지막 달을 보여 준다 (주담대가 한 달 늦어 "-"로 보이지 않게)
  const bothIdx = months.findLastIndex((_, i) => base[i] != null && mortgage[i] != null);

  return (
    <MetricChart
      title="금리" unit="연 % · 전국" months={months} partialFrom={lastIdx + 1} partialLabel="발표 전" format="rate" height={180}
      focus={bothIdx >= 0 ? bothIdx : undefined}
      note="한국은행 ECOS · 주담대는 한 달 늦게 발표"
      series={[
        { key: "base", label: "기준금리", color: "var(--rate-base)", values: base },
        { key: "mortgage", label: "주담대(신규취급액)", color: "var(--rate-mortgage)", values: mortgage },
      ]}
    >
      주담대 = 예금은행 주택담보대출 신규취급액 가중평균 금리입니다. 지역과 관계없는 전국 값입니다.
    </MetricChart>
  );
}

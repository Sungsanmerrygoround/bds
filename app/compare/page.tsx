import { Dimmed, FilterScope, OptionList, RailLayout, RangeList } from "../_components/Filters";
import { CompareCharts, type CompareSeries } from "../_components/CompareCharts";
import { PeakTable } from "../_components/PeakTable";
import { WeeklyChart, type WeeklySeries } from "../_components/WeeklyChart";
import { AREA_BAND_LABEL, BAND_OPTIONS, bandText, bandValue, parseBand } from "@/lib/area";
import { formatEok, formatYm, shortYm } from "@/lib/format";
import { groupColor } from "@/lib/groups";
import { rebase } from "@/lib/chart";
import { getGroups, getTrend, getWeeklyIndex } from "@/lib/queries";
import { currentYm, DATA_START, lastCompleteYm, minYm, monthEnd, monthsBetween, monthStart, partialIndex, rangeLabel, resolveRange } from "@/lib/range";
import { peakRecovery } from "@/lib/stats";

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const band = parseBand(sp.band);
  const mode = sp.view === "index" ? "index" : "price";

  const groups = await getGroups();
  // 전고점 대비를 위해 보관 기간 전체를 받고, 차트는 기간만 쓴다
  const histFrom = minYm(range.from, DATA_START);
  const trends = await Promise.all(groups.map((g) => getTrend(g.id, band, histFrom, range.to)));
  const histMonths = monthsBetween(histFrom, range.to);
  const lastDone = lastCompleteYm();
  const peaks = groups.map((g, i) => {
    const byYm = new Map(trends[i].map((r) => [r.ym, r.trade_median]));
    return { key: String(g.id), label: g.name, color: groupColor(i), peak: peakRecovery(histMonths, histMonths.map((m) => byYm.get(m) ?? null), lastDone) };
  });

  const months = monthsBetween(range.from, range.to);
  const partialFrom = partialIndex(months);

  const series: CompareSeries[] = groups.map((g, i) => {
    const byYm = new Map(trends[i].map((r) => [r.ym, r]));
    return {
      id: g.id,
      name: g.name,
      color: groupColor(i),
      price: months.map((m) => byYm.get(m)?.trade_median ?? null),
      count: months.map((m) => byYm.get(m)?.trade_count ?? 0),
    };
  });
  const hasData = series.some((s) => s.price.some((v) => v != null));

  // 부동산원 주간 매매지수: 구마다 한 선, 기간 첫 주 = 100 (구성남은 같은 색 실선·점선)
  const weekRows = await getWeeklyIndex(groups.flatMap((g) => g.regions.map((r) => r.id)), ["sale"], monthStart(range.from), monthEnd(range.to));
  const weeks = [...new Set(weekRows.map((r) => r.week_date))].sort();
  const weekly: WeeklySeries[] = groups.flatMap((g, i) => g.regions.map((r, j) => {
    const m = new Map(weekRows.filter((x) => x.region_id === r.id).map((x) => [x.week_date, x.value]));
    return {
      key: String(r.id),
      label: g.regions.length > 1 ? `${g.name} ${r.sigungu_name.split(" ").at(-1)}` : g.name,
      color: groupColor(i),
      dashed: j > 0,
      values: rebase(weeks.map((d) => m.get(d) ?? null)),
    };
  }));

  return (
    <FilterScope>
      <h1 className="sr-only">지역 비교</h1>
      <RailLayout
        summary={[bandText(band), rangeLabel(range), mode === "price" ? "가격" : "지수"]}
        rail={
          <>
            <OptionList
              label="보기"
              param="view"
              value={mode}
              cols={2}
              options={[
                { value: "price", label: "가격", aside: "억 원" },
                { value: "index", label: "지수", aside: "첫 3개월=100" },
              ]}
            />
            <OptionList label="전용면적" param="band" value={bandValue(band)} cols={4} options={BAND_OPTIONS} />
            <RangeList rangeKey={range.key} from={range.from} to={range.to} max={currentYm()} />
          </>
        }
      >
        <Dimmed className="flex flex-col gap-4">
          <p className="hidden text-sm text-ink-2 lg:block">
            지역 비교 · {band == null ? "전체 면적" : AREA_BAND_LABEL[band]} ·{" "}
            <span className="mono">{formatYm(range.from)} – {formatYm(range.to)}</span>
            {mode === "index" && <span className="text-muted"> · 각 지역의 기간 첫 3개월 평균 중위가를 100으로 둔 상대 변화</span>}
          </p>

          {hasData ? (
            <CompareCharts months={months} partialFrom={partialFrom} series={series} mode={mode} />
          ) : (
            <p className="panel py-16 text-center text-sm text-muted">이 조건에 해당하는 거래가 없습니다.</p>
          )}

          {weeks.length > 1 && (
            <WeeklyChart title="주간 매매가격지수" unit={`한국부동산원 · 기간 첫 주(${weeks[0].slice(2).replace(/-/g, ".")})=100`} weeks={weeks} series={weekly} height={240}
              note="매주 목요일 발표 · 괄호는 전주 대비">
              실거래보다 빠른 흐름을 봅니다. 부동산원 지수는 구 전체 기준이라 구성남의 창곡동 제외는 반영되지 않습니다.
            </WeeklyChart>
          )}

          {hasData && (
            <PeakTable title={`매매 전고점 대비 · ${bandText(band)}`} rows={peaks}
              note={`${shortYm(DATA_START)} 이후 월별 중위가의 3개월 이동평균 기준`} />
          )}

          <details className="panel px-4 py-3 text-sm">
            <summary className="flex min-h-8 cursor-pointer items-center text-ink-2">표로 보기</summary>
            <div className="overflow-x-auto">
              <table className="mono mt-2 w-full min-w-[720px] text-right text-xs">
                <thead className="text-muted">
                  <tr>
                    <th rowSpan={2} className="py-1.5 text-left align-bottom font-normal">월</th>
                    <th colSpan={series.length} className="border-b border-line pb-1 font-normal">매매 중위가</th>
                    <th colSpan={series.length} className="border-b border-line pb-1 font-normal">매매 거래량(건)</th>
                  </tr>
                  <tr>
                    {[...series, ...series].map((s, k) => (
                      <th key={k} className="py-1 font-sans font-normal">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => ({ m, i })).reverse().map(({ m, i }) => (
                    <tr key={m} className="border-t border-line">
                      <td className="py-1.5 text-left">
                        {formatYm(m)}
                        {i >= partialFrom && <span className="ml-1.5 text-s2">집계 중</span>}
                      </td>
                      {series.map((s) => <td key={`p${s.id}`}>{formatEok(s.price[i])}</td>)}
                      {series.map((s) => <td key={`c${s.id}`}>{s.count[i]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </Dimmed>
      </RailLayout>
    </FilterScope>
  );
}

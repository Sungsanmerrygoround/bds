import { Dimmed, FilterScope, OptionList, RailLayout, RangeList } from "../_components/Filters";
import { CompareCharts, type CompareSeries } from "../_components/CompareCharts";
import { AREA_BAND_LABEL, BAND_OPTIONS, bandText, bandValue, parseBand } from "@/lib/area";
import { formatEok, formatYm } from "@/lib/format";
import { groupColor } from "@/lib/groups";
import { getGroups, getTrend } from "@/lib/queries";
import { currentYm, monthsBetween, partialFromYm, rangeLabel, resolveRange } from "@/lib/range";

export default async function ComparePage({ searchParams }: PageProps<"/compare">) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const band = parseBand(sp.band);
  const mode = sp.view === "index" ? "index" : "price";

  const groups = await getGroups();
  const trends = await Promise.all(groups.map((g) => getTrend(g.id, band, range.from, range.to)));

  const months = monthsBetween(range.from, range.to);
  const partialYm = partialFromYm();
  const partialIdx = months.findIndex((m) => m >= partialYm);
  const partialFrom = partialIdx < 0 ? months.length : partialIdx;

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

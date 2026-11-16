import { Dimmed, FilterScope, OptionList, RailLayout, RangeList } from "../_components/Filters";
import { MetricChart } from "../_components/MetricChart";
import { rateValues } from "../_components/RateChart";
import { Stat } from "../_components/ui";
import { BAND_OPTIONS, bandText, bandValue, parseBand } from "@/lib/area";
import { formatEok, formatYm, shortYm, yearAgoDelta } from "@/lib/format";
import { findGroup, groupOptions, groupValue } from "@/lib/params";
import { getGroups, getRates, getRentMonthly, type RentMonthlyRow } from "@/lib/queries";
import { sharePct } from "@/lib/stats";
import { addMonths, currentYm, lastCompleteYm, minYm, monthsBetween, partialFromYm, partialIndex, rangeLabel, resolveRange } from "@/lib/range";

// 월세 분석: 전월세 신고에서 월세가 차지하는 비중과 전월세 전환율(전세 보증금을 월세로 바꿀 때의 연 이율).
// 비중·전환율은 갱신 아닌 계약 기준 — 갱신은 종전 조건에 묶여 지금 시장을 덜 보여 준다.

const MIN_N = 5; // 한 달 표본이 이보다 적으면 그리지 않는다
const LEGAL_SPREAD = 2; // 법정 전월세 전환율 상한 = 기준금리 + 2%p (주택임대차보호법 시행령, 계약 중 전환에 적용)

export default async function RentPage({ searchParams }: PageProps<"/rent">) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const band = parseBand(sp.band);
  const groups = await getGroups();
  const group = findGroup(groups, sp.g) ?? null;

  const lastDone = lastCompleteYm();
  const fetchFrom = minYm(range.from, addMonths(lastDone, -12)); // 1년 전 비교용
  const [rows, rates] = await Promise.all([
    getRentMonthly(group?.id ?? null, band, fetchFrom, range.to),
    getRates(range.from, range.to),
  ]);

  const months = monthsBetween(range.from, range.to);
  const partialYm = partialFromYm();
  const partialFrom = partialIndex(months);
  const byYm = new Map(rows.map((r) => [r.ym, r]));
  const at = (m: string) => byYm.get(m);

  const newShare = (r?: RentMonthlyRow) => (r ? sharePct(r.wolse_new_count, r.jeonse_new_count + r.wolse_new_count, MIN_N) : null);
  const allShare = (r?: RentMonthlyRow) => (r ? sharePct(r.wolse_count, r.jeonse_count + r.wolse_count, MIN_N) : null);
  const conv = (r?: RentMonthlyRow) => (r && r.conv_count >= MIN_N ? r.conv_rate_median : null);
  const enough = (r?: RentMonthlyRow) => !!r && r.wolse_new_count >= MIN_N;

  const now = at(lastDone), ago = at(addMonths(lastDone, -12));
  const where = `${group?.name ?? "전체 지역"} · ${bandText(band)}`;

  return (
    <FilterScope>
      <h1 className="sr-only">월세</h1>
      <RailLayout
        summary={[group?.name ?? "전체 지역", bandText(band), rangeLabel(range)]}
        rail={
          <>
            <OptionList label="지역" param="g" value={groupValue(group?.id)} cols={2} options={groupOptions(groups)} />
            <OptionList label="전용면적" param="band" value={bandValue(band)} cols={4} options={BAND_OPTIONS} />
            <RangeList rangeKey={range.key} from={range.from} to={range.to} max={currentYm()} />
          </>
        }
      >
        <Dimmed className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">
            {where} · <span className="mono">{formatYm(range.from)} – {formatYm(range.to)}</span>
            <span className="text-muted"> · 월세 = 월세가 1만원 이상인 전월세 계약(반전세 포함). 비중·전환율은 갱신 계약 제외.</span>
          </p>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label={`월세 비중 · ${shortYm(lastDone)}`} value={newShare(now) == null ? "-" : newShare(now)!.toFixed(0)} unit={newShare(now) == null ? undefined : "%"}
              {...yearAgoDelta(newShare(now), newShare(ago))} />
            <Stat label={`전월세 전환율 · ${shortYm(lastDone)}`} value={conv(now) == null ? "-" : conv(now)!.toFixed(2)} unit={conv(now) == null ? undefined : "%"}
              {...yearAgoDelta(conv(now), conv(ago))} />
            <Stat label={`월세 보증금 중위 · ${shortYm(lastDone)}`} value={enough(now) ? formatEok(now!.wolse_deposit_median) : "-"}
              sub={enough(now) ? `신규 월세 ${now!.wolse_new_count}건` : undefined} />
            <Stat label={`월세 중위 · ${shortYm(lastDone)}`} value={enough(now) && now!.wolse_rent_median != null ? String(now!.wolse_rent_median) : "-"}
              unit={enough(now) && now!.wolse_rent_median != null ? "만원" : undefined}
              sub={enough(ago) && ago!.wolse_rent_median != null ? `1년 전 ${ago!.wolse_rent_median}만원` : undefined} />
          </div>

          <MetricChart
            title="월세 비중" unit="% · 전월세 계약 중 월세" months={months} partialFrom={partialFrom} format="pct"
            note={`한 달 ${MIN_N}건 미만은 표시 안 함`}
            series={[
              { key: "new", label: "갱신 제외", color: "var(--series-2)", values: months.map((m) => newShare(at(m))) },
              { key: "all", label: "갱신 포함", color: "var(--series-3)", values: months.map((m) => allShare(at(m))) },
            ]}
          >
            새로 맺는 계약에서 월세가 늘면 전세 수요가 월세로 옮겨 가고 있다는 뜻입니다. 갱신 계약은 대부분 종전 형태(전세면 전세)를 유지해 비중이 더 낮게 나옵니다.
          </MetricChart>

          <MetricChart
            title="전월세 전환율" unit="연 % · 계약별 전환율의 중위" months={months} partialFrom={partialFrom} format="rate" height={240}
            note={`한 달 ${MIN_N}건 미만은 표시 안 함`}
            series={[
              { key: "conv", label: "전환율", color: "var(--series-2)", values: months.map((m) => conv(at(m))) },
              { key: "mortgage", label: "주담대 금리", color: "var(--rate-mortgage)", values: rateValues(rates, "mortgage", months) },
              { key: "legal", label: `법정 상한(기준금리+${LEGAL_SPREAD}%p)`, color: "var(--rate-base)", values: rateValues(rates, "base", months).map((v) => (v == null ? null : v + LEGAL_SPREAD)) },
            ]}
          >
            전환율 = 월세 × 12 ÷ (기준 전세 − 월세 보증금). 기준 전세는 같은 단지·같은 전용면적에서 계약일 전후 90일에 맺은 전세(갱신 제외)의 중위값이고,
            기준 전세가 없거나 보증금보다 낮은 계약은 뺍니다. 전환율이 대출 금리보다 높으면 월세보다 대출을 받아 전세로 사는 쪽이 유리해 전세 수요가 늘고,
            낮으면 월세가 유리합니다. 법정 상한은 계약 중에 전세를 월세로 돌릴 때 적용되는 값이라 참고선입니다. 금리는 전국 값(한국은행 ECOS)이고 한두 달 늦게 발표됩니다.
          </MetricChart>

          <details className="panel px-4 py-3 text-sm">
            <summary className="flex min-h-8 cursor-pointer items-center text-ink-2">표로 보기</summary>
            <div className="overflow-x-auto">
              <table className="mono mt-2 w-full min-w-[760px] text-right text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1.5 text-left font-normal">월</th>
                    <th className="font-normal">전세</th>
                    <th className="font-normal">월세</th>
                    <th className="font-normal">전세(갱신 제외)</th>
                    <th className="font-normal">월세(갱신 제외)</th>
                    <th className="font-normal">월세 비중</th>
                    <th className="font-normal">보증금 중위</th>
                    <th className="font-normal">월세 중위</th>
                    <th className="font-normal">전환율</th>
                    <th className="font-normal">전환율 표본</th>
                  </tr>
                </thead>
                <tbody>
                  {[...months].reverse().map((m) => {
                    const r = at(m);
                    return (
                      <tr key={m} className="border-t border-line">
                        <td className="py-1.5 text-left">{formatYm(m)}{m >= partialYm && <span className="ml-1.5 text-s2">집계 중</span>}</td>
                        <td>{r?.jeonse_count ?? 0}</td>
                        <td>{r?.wolse_count ?? 0}</td>
                        <td>{r?.jeonse_new_count ?? 0}</td>
                        <td>{r?.wolse_new_count ?? 0}</td>
                        <td>{newShare(r) == null ? "-" : `${newShare(r)!.toFixed(0)}%`}</td>
                        <td>{formatEok(r?.wolse_deposit_median)}</td>
                        <td>{r?.wolse_rent_median == null ? "-" : `${r.wolse_rent_median}만`}</td>
                        <td>{r?.conv_rate_median == null ? "-" : `${r.conv_rate_median.toFixed(2)}%`}</td>
                        <td>{r?.conv_count ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </Dimmed>
      </RailLayout>
    </FilterScope>
  );
}

import Link from "next/link";
import { Dimmed, FilterScope, OptionList, RailLayout, RangeList } from "../_components/Filters";
import { MetricChart } from "../_components/MetricChart";
import { Badge, Stat } from "../_components/ui";
import { BAND_OPTIONS, bandText, bandValue, parseBand } from "@/lib/area";
import { formatEok, formatYm, shortYm } from "@/lib/format";
import { getGroups, getRenewal, getRenewalDrops, type RenewalRow } from "@/lib/queries";
import { addMonths, currentYm, lastCompleteYm, monthsBetween, partialFromYm, rangeLabel, resolveRange } from "@/lib/range";

// 전세 갱신 분석: 국토부 전월세 신고의 계약 구분(신규/갱신)·갱신요구권·종전 보증금으로
// 갱신 비중과 갱신 때 보증금이 얼마나 오르내렸는지 본다. 감액 갱신이 늘면 역전세 신호.

const MIN_N = 5; // 한 달 표본이 이보다 적으면 비율을 그리지 않는다
const share = (a: number, b: number) => (b >= MIN_N ? (a / b) * 100 : null);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;

export default async function RenewalPage({ searchParams }: PageProps<"/renewal">) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const band = parseBand(sp.band);
  const groups = await getGroups();
  const group = groups.find((g) => String(g.id) === sp.g) ?? null;
  const groupId = group?.id ?? null;

  const lastDone = lastCompleteYm();
  const fetchFrom = [range.from, addMonths(lastDone, -12)].sort()[0]; // 1년 전 비교용
  const dropsSince = `${addMonths(currentYm(), -3).slice(0, 4)}-${addMonths(currentYm(), -3).slice(4)}-01`;
  const [rows, drops] = await Promise.all([
    getRenewal(groupId, band, fetchFrom, range.to),
    getRenewalDrops(groupId, band, dropsSince, 40),
  ]);

  const months = monthsBetween(range.from, range.to);
  const partialYm = partialFromYm();
  const pi = months.findIndex((m) => m >= partialYm);
  const partialFrom = pi < 0 ? months.length : pi;
  const byYm = new Map(rows.map((r) => [r.ym, r]));
  const at = (m: string) => byYm.get(m);

  const renewShare = (r?: RenewalRow) => (r ? share(r.renew_count, r.new_count + r.renew_count) : null);
  const rrShare = (r?: RenewalRow) => (r ? share(r.rr_count, r.renew_count) : null);
  const freeChange = (r?: RenewalRow) => (r && r.free_count >= MIN_N ? r.free_change_median : null);
  const rrChange = (r?: RenewalRow) => (r && r.rr_jeonse_count >= MIN_N ? r.rr_change_median : null);
  const downShare = (r?: RenewalRow) => (r ? share(r.down_count, r.jeonse_renew_count) : null);

  const now = at(lastDone), ago = at(addMonths(lastDone, -12));
  const d = (a: number | null, b: number | null, unit = "%p") =>
    a == null || b == null ? undefined : `${a - b >= 0 ? "▲ +" : "▼ −"}${Math.abs(a - b).toFixed(1)}${unit} 1년 전 대비`;
  // 색은 값이 오른 쪽/내린 쪽만 뜻한다(좋고 나쁨이 아님): 상승 빨강, 하락 파랑
  const tone = (a: number | null, b: number | null) => (a == null || b == null ? "muted" : a - b >= 0 ? "up" : "down") as "up" | "down" | "muted";

  const where = `${group?.name ?? "전체 지역"} · ${bandText(band)}`;

  return (
    <FilterScope>
      <h1 className="sr-only">전세 갱신</h1>
      <RailLayout
        summary={[group?.name ?? "전체 지역", bandText(band), rangeLabel(range)]}
        rail={
          <>
            <OptionList label="지역" param="g" value={groupId ? String(groupId) : "all"} cols={2}
              options={[{ value: "all", label: "전체" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
            <OptionList label="전용면적" param="band" value={bandValue(band)} cols={4} options={BAND_OPTIONS} />
            <RangeList rangeKey={range.key} from={range.from} to={range.to} max={currentYm()} />
          </>
        }
      >
        <Dimmed className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">
            {where} · <span className="mono">{formatYm(range.from)} – {formatYm(range.to)}</span>
            <span className="text-muted"> · 전월세 신고의 계약 구분(신규·갱신)이 있는 계약 기준. 보증금 변동은 전세→전세 갱신만.</span>
          </p>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label={`갱신 비중 · ${shortYm(lastDone)}`} value={renewShare(now) == null ? "-" : renewShare(now)!.toFixed(0)} unit={renewShare(now) == null ? undefined : "%"}
              sub={d(renewShare(now), renewShare(ago))} subTone={tone(renewShare(now), renewShare(ago))} />
            <Stat label={`갱신요구권 사용 · ${shortYm(lastDone)}`} value={rrShare(now) == null ? "-" : rrShare(now)!.toFixed(0)} unit={rrShare(now) == null ? undefined : "%"}
              sub={d(rrShare(now), rrShare(ago))} subTone={tone(rrShare(now), rrShare(ago))} />
            <Stat label={`합의 갱신 보증금 변동 · ${shortYm(lastDone)}`} value={freeChange(now) == null ? "-" : signed(freeChange(now)!)}
              sub={d(freeChange(now), freeChange(ago))} subTone={tone(freeChange(now), freeChange(ago))} />
            <Stat label={`감액 갱신 비중 · ${shortYm(lastDone)}`} value={downShare(now) == null ? "-" : downShare(now)!.toFixed(0)} unit={downShare(now) == null ? undefined : "%"}
              sub={d(downShare(now), downShare(ago))} subTone={tone(downShare(now), downShare(ago))} />
          </div>

          <MetricChart
            title="갱신 계약 비중" unit="%" months={months} partialFrom={partialFrom} format="pct"
            note={`한 달 ${MIN_N}건 미만은 표시 안 함`}
            series={[
              { key: "renew", label: "갱신 / 전체 계약", color: "var(--series-2)", values: months.map((m) => renewShare(at(m))) },
              { key: "rr", label: "갱신요구권 / 갱신", color: "var(--series-3)", values: months.map((m) => rrShare(at(m))) },
            ]}
          />
          <MetricChart
            title="갱신 때 보증금 변동률" unit="% · 종전 대비 중위, 전세→전세" months={months} partialFrom={partialFrom} format="signedPct" zero height={200}
            series={[
              { key: "free", label: "합의 갱신", color: "var(--series-2)", values: months.map((m) => freeChange(at(m))) },
              { key: "rr", label: "갱신요구권", color: "var(--series-3)", values: months.map((m) => rrChange(at(m))) },
            ]}
          >
            합의 갱신 = 갱신요구권을 쓰지 않은 갱신으로, 시장 흐름이 그대로 드러납니다. 갱신요구권 갱신은 인상 상한이 5%라 +5% 근처에 모입니다.
            0 아래면 보증금을 낮춰 갱신한 계약이 더 많다는 뜻입니다.
          </MetricChart>
          <MetricChart
            title="감액 갱신 비중" unit="% · 전세→전세 갱신 중 보증금을 낮춘 계약" months={months} partialFrom={partialFrom} format="pct" height={180}
            series={[{ key: "down", label: "감액 / 전세 갱신", color: "var(--down)", values: months.map((m) => downShare(at(m))) }]}
          />

          <section className="panel px-4 pb-3 pt-3.5">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">최근 3개월 감액 갱신 <span className="text-xs font-normal text-muted">감액 폭 큰 순 {drops.length}건</span></h2>
            </div>
            <div className="overflow-x-auto">
              <table className="mono w-full min-w-[640px] text-[13px]">
                <thead className="text-xs text-muted">
                  <tr className="text-right">
                    <th className="py-1 text-left font-normal">계약일</th>
                    <th className="text-left font-normal">단지</th>
                    <th className="font-normal">전용</th>
                    <th className="font-normal">층</th>
                    <th className="font-normal">종전</th>
                    <th className="font-normal">갱신</th>
                    <th className="font-normal">변동</th>
                  </tr>
                </thead>
                <tbody>
                  {drops.map((r) => (
                    <tr key={r.id} className="border-t border-line text-right hover:bg-wash">
                      <td className="py-1.5 text-left">{r.deal_date}</td>
                      <td className="text-left font-sans">
                        <Link href={`/complex/${encodeURIComponent(r.apt_seq)}?area=${r.area_type}`} className="font-medium hover:underline">{r.apt_nm}</Link>
                        <span className="ml-1.5 text-xs text-muted">{r.sigungu_name} {r.umd_nm}</span>
                        {r.use_rr_right && <span className="ml-1.5"><Badge>갱신요구권</Badge></span>}
                      </td>
                      <td>{r.area_type}㎡</td>
                      <td>{r.floor ?? "-"}</td>
                      <td className="text-ink-2">{formatEok(r.pre_deposit_man)}</td>
                      <td className="font-medium">{formatEok(r.deposit_man)}</td>
                      <td className="text-down">{Number(r.change_pct).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {drops.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted">최근 3개월에 보증금을 낮춘 갱신이 없습니다.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <details className="panel px-4 py-3 text-sm">
            <summary className="flex min-h-8 cursor-pointer items-center text-ink-2">표로 보기</summary>
            <div className="overflow-x-auto">
              <table className="mono mt-2 w-full min-w-[720px] text-right text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1.5 text-left font-normal">월</th>
                    <th className="font-normal">신규</th>
                    <th className="font-normal">갱신</th>
                    <th className="font-normal">갱신요구권</th>
                    <th className="font-normal">전세 갱신</th>
                    <th className="font-normal">합의 변동</th>
                    <th className="font-normal">요구권 변동</th>
                    <th className="font-normal">감액</th>
                    <th className="font-normal">증액</th>
                  </tr>
                </thead>
                <tbody>
                  {[...months].reverse().map((m) => {
                    const r = at(m);
                    return (
                      <tr key={m} className="border-t border-line">
                        <td className="py-1.5 text-left">{formatYm(m)}{m >= partialYm && <span className="ml-1.5 text-s2">집계 중</span>}</td>
                        <td>{r?.new_count ?? 0}</td>
                        <td>{r?.renew_count ?? 0}</td>
                        <td>{r?.rr_count ?? 0}</td>
                        <td>{r?.jeonse_renew_count ?? 0}</td>
                        <td>{r?.free_change_median == null ? "-" : signed(r.free_change_median)}</td>
                        <td>{r?.rr_change_median == null ? "-" : signed(r.rr_change_median)}</td>
                        <td>{r?.down_count ?? 0}</td>
                        <td>{r?.up_count ?? 0}</td>
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

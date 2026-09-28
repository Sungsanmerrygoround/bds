import { Dimmed, FilterBar, FilterScope, ParamSelect, RangePicker } from "./_components/Filters";
import { Legend, TrendChart, VolumeChart, type TrendPoint } from "./_components/Charts";
import { Card, Stat } from "./_components/ui";
import { AREA_BANDS, AREA_BAND_LABEL } from "@/lib/area";
import { formatEok, formatPct, formatYm } from "@/lib/format";
import { getGroups, getTrend } from "@/lib/queries";
import { addMonths, currentYm, monthsBetween, resolveRange } from "@/lib/range";

export default async function TrendPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const groups = await getGroups();
  const group = groups.find((g) => String(g.id) === sp.g) ?? groups[0];
  const bandParam = typeof sp.band === "string" ? sp.band : "84";
  const band = AREA_BANDS.find((b) => String(b) === bandParam) ?? null; // "all" → null

  const rows = await getTrend(group.id, band, range.from, range.to);
  const byYm = new Map(rows.map((r) => [r.ym, r]));
  const partialFrom = addMonths(currentYm(), -1);
  const data: TrendPoint[] = monthsBetween(range.from, range.to).map((ym) => {
    const r = byYm.get(ym);
    return {
      ym,
      trade: r?.trade_median ?? null,
      jeonse: r?.jeonse_median ?? null,
      tradeCount: r?.trade_count ?? 0,
      jeonseCount: r?.jeonse_count ?? 0,
      partial: ym >= partialFrom,
    };
  });

  // 요약: 집계가 끝난 최근 달 기준, 1년 전 같은 달과 비교
  const latest = [...data].reverse().find((d) => !d.partial && d.trade != null);
  const yearAgo = latest && byYm.get(addMonths(latest.ym, -12));
  const pct = (a: number | null | undefined, b: number | null | undefined) => (a && b ? (a / b - 1) * 100 : null);

  return (
    <FilterScope>
      <h1 className="mb-4 text-xl font-semibold">매매·전세 추이</h1>
      <FilterBar>
        <RangePicker rangeKey={range.key} from={range.from} to={range.to} max={currentYm()} />
        <ParamSelect label="지역" param="g" value={String(group.id)} options={groups.map((g) => ({ value: String(g.id), label: g.name }))} />
        <ParamSelect
          label="전용면적"
          param="band"
          value={band == null ? "all" : String(band)}
          options={[{ value: "all", label: "전체" }, ...AREA_BANDS.map((b) => ({ value: String(b), label: AREA_BAND_LABEL[b] }))]}
        />
      </FilterBar>

      <Dimmed>
        <p className="mb-4 text-sm text-ink-2">
          {group.name}({group.regions.map((r) => r.sigungu_name).join(", ")}) · {band == null ? "전체 면적" : `전용 ${AREA_BAND_LABEL[band]}`} ·{" "}
          {formatYm(range.from)} ~ {formatYm(range.to)}
        </p>

        {latest && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`매매 중위가 (${formatYm(latest.ym)})`} value={formatEok(latest.trade)} sub={yearAgo ? `1년 전 대비 ${formatPct(pct(latest.trade, yearAgo.trade_median))}` : undefined} />
            <Stat label={`전세 중위가 (${formatYm(latest.ym)})`} value={formatEok(latest.jeonse)} sub={yearAgo ? `1년 전 대비 ${formatPct(pct(latest.jeonse, yearAgo.jeonse_median))}` : undefined} />
            <Stat label="전세가율" value={latest.trade && latest.jeonse ? `${Math.round((latest.jeonse / latest.trade) * 100)}%` : "-"} />
            <Stat label="매매 / 전세 거래" value={`${latest.tradeCount} / ${latest.jeonseCount}건`} />
          </div>
        )}

        <Card
          title="월별 중위가"
          subtitle="해제·정정 거래 제외. 최근 2개월은 신고 기한(계약 후 30일) 때문에 아직 집계 중."
          right={<Legend items={[{ color: "var(--series-1)", label: "매매" }, { color: "var(--series-2)", label: "전세" }]} />}
        >
          {rows.length === 0 ? <Empty /> : <TrendChart data={data} />}
        </Card>

        <Card
          title="월별 거래량"
          right={<Legend items={[{ color: "var(--series-1)", label: "매매" }, { color: "var(--series-2)", label: "전세" }]} />}
        >
          {rows.length === 0 ? <Empty /> : <VolumeChart data={data} />}
        </Card>

        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-ink-2">표로 보기</summary>
          <table className="tnum mt-2 w-full text-right">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-normal">월</th>
                <th className="font-normal">매매 중위가</th>
                <th className="font-normal">건수</th>
                <th className="font-normal">전세 중위가</th>
                <th className="font-normal">건수</th>
                <th className="font-normal">전세가율</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.ym} className="border-t border-line">
                  <td className="py-1 text-left">{formatYm(d.ym)}{d.partial && <span className="ml-1 text-xs text-muted">집계 중</span>}</td>
                  <td>{formatEok(d.trade)}</td>
                  <td>{d.tradeCount}</td>
                  <td>{formatEok(d.jeonse)}</td>
                  <td>{d.jeonseCount}</td>
                  <td>{d.trade && d.jeonse ? `${Math.round((d.jeonse / d.trade) * 100)}%` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Dimmed>
    </FilterScope>
  );
}

function Empty() {
  return <p className="py-16 text-center text-sm text-muted">이 조건에 해당하는 거래가 없습니다.</p>;
}

import { Dimmed, FilterScope, OptionList, RailLayout, RangeList } from "./_components/Filters";
import { TrendTerminal, type TermPoint } from "./_components/TrendTerminal";
import { Spark, SparkBars, Stat } from "./_components/ui";
import { AREA_BANDS, AREA_BAND_LABEL } from "@/lib/area";
import { formatEok, formatYm } from "@/lib/format";
import { getGroups, getTrend } from "@/lib/queries";
import { addMonths, currentYm, monthsBetween, resolveRange } from "@/lib/range";

const shortYm = (ym: string) => `${ym.slice(2, 4)}.${ym.slice(4)}`;
const BAND_ASIDE: Record<number, string> = { 59: "55–64㎡", 74: "65–79㎡", 84: "80–89㎡", 100: "90–114㎡", 125: "115–139㎡", 150: "140㎡–" };

export default async function TrendPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const groups = await getGroups();
  const group = groups.find((g) => String(g.id) === sp.g) ?? groups[0];
  const bandParam = typeof sp.band === "string" ? sp.band : "84";
  const band = AREA_BANDS.find((b) => String(b) === bandParam) ?? null; // "all" → null

  // 신고 기한(계약 후 30일) 때문에 이번 달·지난달은 집계 중. 그 전 달이 집계가 끝난 최근 달.
  const now = currentYm();
  const partialFrom = addMonths(now, -1);
  const lastDone = addMonths(now, -2);

  // 1년 전 비교·12개월 스파크라인을 위해 최소 24개월은 받는다
  const fetchFrom = [range.from, addMonths(range.to, -23)].sort()[0];
  const [rows, groupLatest] = await Promise.all([
    getTrend(group.id, band, fetchFrom, range.to),
    Promise.all(groups.map((g) => getTrend(g.id, band, lastDone, lastDone).then((r) => r[0]?.trade_median ?? null))),
  ]);
  const byYm = new Map(rows.map((r) => [r.ym, r]));
  const full: TermPoint[] = monthsBetween(fetchFrom, range.to).map((ym) => {
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
  const chart = full.filter((d) => d.ym >= range.from);

  // 요약: 기간 끝 기준 집계가 끝난 최근 달, 1년 전 같은 달과 비교
  const latest = [...full].reverse().find((d) => !d.partial && d.trade != null);
  const yearAgo = latest && full.find((d) => d.ym === addMonths(latest.ym, -12));
  const pct = (a?: number | null, b?: number | null) => (a && b ? (a / b - 1) * 100 : null);
  const ratio = (d?: TermPoint) => (d?.trade && d.jeonse ? (d.jeonse / d.trade) * 100 : null);
  const last12 = full.slice(-12);
  const partialIn12 = last12.filter((d) => d.partial).length;
  const done12 = full.filter((d) => !d.partial).slice(-12);
  const avg = (k: "tradeCount" | "jeonseCount") => Math.round(done12.reduce((s, d) => s + d[k], 0) / Math.max(1, done12.length));

  const delta = (v: number | null, unit = "%") =>
    v == null ? undefined : `${v >= 0 ? "▲ +" : "▼ −"}${Math.abs(v).toFixed(1)}${unit}`;
  const tone = (v: number | null) => (v == null ? "muted" : v >= 0 ? "up" : "down") as "up" | "down" | "muted";
  const tp = pct(latest?.trade, yearAgo?.trade);
  const jp = pct(latest?.jeonse, yearAgo?.jeonse);
  const rNow = ratio(latest), rAgo = ratio(yearAgo);
  const rd = rNow != null && rAgo != null ? rNow - rAgo : null;
  const title = `${group.name} · ${band == null ? "전체 면적" : `전용 ${band}㎡`}`;

  return (
    <FilterScope>
      <h1 className="sr-only">매매·전세 추이</h1>
      <RailLayout
        rail={
          <>
            <RangeList rangeKey={range.key} from={range.from} to={range.to} max={now} />
            <OptionList
              label={`지역 · ${shortYm(lastDone)} 매매 중위`}
              param="g"
              value={String(group.id)}
              options={groups.map((g, i) => ({
                value: String(g.id),
                label: g.name,
                aside: groupLatest[i] == null ? "-" : formatEok(groupLatest[i]),
              }))}
            />
            <OptionList
              label="전용면적"
              param="band"
              value={band == null ? "all" : String(band)}
              options={[
                { value: "all", label: "전체" },
                ...AREA_BANDS.map((b) => ({ value: String(b), label: String(b), aside: BAND_ASIDE[b] })),
              ]}
            />
          </>
        }
      >
        <Dimmed className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">
            {group.name}
            <span className="text-muted"> ({group.regions.map((r) => r.sigungu_name).join(", ")})</span> · {band == null ? "전체 면적" : AREA_BAND_LABEL[band]} ·{" "}
            <span className="mono">{formatYm(range.from)} – {formatYm(range.to)}</span>
          </p>

          {latest ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat label={`매매 중위 · ${shortYm(latest.ym)}`} value={(latest.trade! / 10000).toFixed(2)} unit="억"
                sub={delta(tp) && <>{delta(tp)} <span className="text-muted">1년 전 대비</span></>} subTone={tone(tp)}>
                <Spark values={last12.map((d) => d.trade)} color="var(--series-1)" gradient="grad-s1" partial={partialIn12} />
              </Stat>
              <Stat label={`전세 중위 · ${shortYm(latest.ym)}`} value={latest.jeonse ? (latest.jeonse / 10000).toFixed(2) : "-"} unit={latest.jeonse ? "억" : undefined}
                sub={delta(jp) && <>{delta(jp)} <span className="text-muted">1년 전 대비</span></>} subTone={tone(jp)}>
                <Spark values={last12.map((d) => d.jeonse)} color="var(--series-2)" gradient="grad-s2" partial={partialIn12} />
              </Stat>
              <Stat label={`전세가율 · ${shortYm(latest.ym)}`} value={rNow == null ? "-" : String(Math.round(rNow))} unit={rNow == null ? undefined : "%"}
                sub={delta(rd, "%p") && <>{delta(rd, "%p")} <span className="text-muted">1년 전 대비</span></>} subTone={tone(rd)}>
                <Spark values={last12.map(ratio)} color="var(--series-3)" gradient="grad-s3" partial={partialIn12} />
              </Stat>
              <Stat label={`거래 매매 / 전세 · ${shortYm(latest.ym)}`} value={String(latest.tradeCount)} unit={` / ${latest.jeonseCount}`}
                sub={<>12개월 평균 {avg("tradeCount")} / {avg("jeonseCount")}</>}>
                <SparkBars values={last12.map((d) => d.tradeCount)} color="var(--series-1)" />
              </Stat>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <p className="panel py-16 text-center text-sm text-muted">이 조건에 해당하는 거래가 없습니다.</p>
          ) : (
            <TrendTerminal data={chart} title={title} />
          )}

          <details className="panel px-4 py-3 text-sm">
            <summary className="cursor-pointer text-ink-2">표로 보기</summary>
            <table className="mono mt-2 w-full text-right text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1.5 text-left font-normal">월</th>
                  <th className="font-normal">매매 중위</th>
                  <th className="font-normal">건수</th>
                  <th className="font-normal">전세 중위</th>
                  <th className="font-normal">건수</th>
                  <th className="font-normal">전세가율</th>
                </tr>
              </thead>
              <tbody>
                {[...chart].reverse().map((d) => (
                  <tr key={d.ym} className="border-t border-line">
                    <td className="py-1.5 text-left">{formatYm(d.ym)}{d.partial && <span className="ml-1.5 text-s2">집계 중</span>}</td>
                    <td>{formatEok(d.trade)}</td>
                    <td>{d.tradeCount}</td>
                    <td>{formatEok(d.jeonse)}</td>
                    <td>{d.jeonseCount}</td>
                    <td>{ratio(d) == null ? "-" : `${Math.round(ratio(d)!)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Dimmed>
      </RailLayout>
    </FilterScope>
  );
}

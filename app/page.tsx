import { Dimmed, FilterScope, OptionList, RailLayout, RangeList } from "./_components/Filters";
import { PeakTable } from "./_components/PeakTable";
import { TrendTerminal, type TermPoint } from "./_components/TrendTerminal";
import { Spark, SparkBars, Stat } from "./_components/ui";
import { AREA_BAND_LABEL, BAND_OPTIONS, bandText, bandValue, parseBand } from "@/lib/area";
import { formatEok, formatYm, shortYm } from "@/lib/format";
import { getGroups, getTrend } from "@/lib/queries";
import { addMonths, currentYm, DATA_START, lastCompleteYm, monthsBetween, partialFromYm, rangeLabel, resolveRange } from "@/lib/range";
import { peakRecovery } from "@/lib/stats";

const ratioOf = (d?: TermPoint) => (d?.trade && d.jeonse ? (d.jeonse / d.trade) * 100 : null);
const pct = (a?: number | null, b?: number | null) => (a && b ? (a / b - 1) * 100 : null);
const delta = (v: number | null, unit = "%") => (v == null ? null : `${v >= 0 ? "▲ +" : "▼ −"}${Math.abs(v).toFixed(1)}${unit}`);
const tone = (v: number | null) => (v == null ? "muted" : v >= 0 ? "up" : "down") as "up" | "down" | "muted";
const toneCls = { up: "text-up", down: "text-down", muted: "text-muted" } as const;

export default async function TrendPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const band = parseBand(sp.band);
  const groups = await getGroups();
  const group = groups.find((g) => String(g.id) === sp.g) ?? groups[0];

  const now = currentYm();
  const partialFrom = partialFromYm();
  const lastDone = lastCompleteYm();

  // 전고점 대비를 위해 보관 기간 전체를 받는다 (1년 전 비교·12개월 스파크라인도 여기서)
  const fetchFrom = [range.from, DATA_START].sort()[0];
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
  const last12 = full.slice(-12);
  const partialIn12 = last12.filter((d) => d.partial).length;
  const done12 = full.filter((d) => !d.partial).slice(-12);
  const avg = (k: "tradeCount" | "jeonseCount") => Math.round(done12.reduce((s, d) => s + d[k], 0) / Math.max(1, done12.length));
  const tp = pct(latest?.trade, yearAgo?.trade);
  const jp = pct(latest?.jeonse, yearAgo?.jeonse);
  const rNow = ratioOf(latest), rAgo = ratioOf(yearAgo);
  const fullMonths = full.map((d) => d.ym);
  const peaks = [
    { key: "t", label: "매매", color: "var(--series-1)", peak: peakRecovery(fullMonths, full.map((d) => d.trade), lastDone) },
    { key: "j", label: "전세", color: "var(--series-2)", peak: peakRecovery(fullMonths, full.map((d) => d.jeonse), lastDone) },
  ];
  const rd = rNow != null && rAgo != null ? rNow - rAgo : null;

  return (
    <FilterScope>
      <h1 className="sr-only">매매·전세 추이</h1>
      <RailLayout
        summary={[group.name, bandText(band), rangeLabel(range)]}
        rail={
          <>
            <OptionList
              label={`지역 · ${shortYm(lastDone)} 매매 중위`}
              param="g"
              value={String(group.id)}
              cols={1}
              options={groups.map((g, i) => ({ value: String(g.id), label: g.name, aside: formatEok(groupLatest[i]) }))}
            />
            <OptionList label="전용면적" param="band" value={bandValue(band)} cols={4} options={BAND_OPTIONS} />
            <RangeList rangeKey={range.key} from={range.from} to={range.to} max={now} />
          </>
        }
      >
        <Dimmed className="flex flex-col gap-4">
          <p className="hidden text-sm text-ink-2 lg:block">
            {group.name}
            <span className="text-muted"> ({group.regions.map((r) => r.sigungu_name).join(", ")})</span> · {band == null ? "전체 면적" : AREA_BAND_LABEL[band]} ·{" "}
            <span className="mono">{formatYm(range.from)} – {formatYm(range.to)}</span>
          </p>

          {latest && (
            <>
              {/* 좁은 화면: 매매 중위가를 크게, 나머지는 작은 3칸 */}
              <section className="flex flex-col gap-2.5 sm:hidden" aria-label="요약">
                <div className="cap">{group.name} · {bandText(band)} · {shortYm(latest.ym)} 매매 중위</div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="mono text-[40px] font-semibold leading-none">
                      {(latest.trade! / 10000).toFixed(2)}<span className="text-lg text-ink-2">억</span>
                    </div>
                    {delta(tp) && (
                      <div className={`mono mt-1.5 text-xs ${toneCls[tone(tp)]}`}>
                        {delta(tp)} <span className="text-muted">1년 전 {formatEok(yearAgo?.trade)}</span>
                      </div>
                    )}
                  </div>
                  <div className="w-28 shrink-0">
                    <Spark values={last12.map((d) => d.trade)} color="var(--series-1)" gradient="grad-s1" partial={partialIn12} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="전세 중위" value={latest.jeonse ? (latest.jeonse / 10000).toFixed(2) : "-"} unit={latest.jeonse ? "억" : ""} sub={delta(jp)} tone={tone(jp)} />
                  <MiniStat label="전세가율" value={rNow == null ? "-" : String(Math.round(rNow))} unit={rNow == null ? "" : "%"} sub={delta(rd, "%p")} tone={tone(rd)} />
                  <MiniStat label="거래 매매/전세" value={String(latest.tradeCount)} unit={`/${latest.jeonseCount}`} sub={`평균 ${avg("tradeCount")}/${avg("jeonseCount")}`} tone="muted" />
                </div>
              </section>

              <div className="hidden grid-cols-2 gap-3 sm:grid xl:grid-cols-4">
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
                  <Spark values={last12.map(ratioOf)} color="var(--series-3)" gradient="grad-s3" partial={partialIn12} />
                </Stat>
                <Stat label={`거래 매매 / 전세 · ${shortYm(latest.ym)}`} value={String(latest.tradeCount)} unit={` / ${latest.jeonseCount}`}
                  sub={<>12개월 평균 {avg("tradeCount")} / {avg("jeonseCount")}</>}>
                  <SparkBars values={last12.map((d) => d.tradeCount)} color="var(--series-1)" />
                </Stat>
              </div>
            </>
          )}

          {rows.length === 0 ? (
            <p className="panel py-16 text-center text-sm text-muted">이 조건에 해당하는 거래가 없습니다.</p>
          ) : (
            <TrendTerminal data={chart} title={`${group.name} · ${bandText(band)}`} />
          )}

          {rows.length > 0 && (
            <PeakTable title={`전고점 대비 · ${group.name} · ${bandText(band)}`} rows={peaks}
              note={`${shortYm(DATA_START)} 이후 월별 중위가의 3개월 이동평균 기준`} />
          )}

          <details className="panel px-4 py-3 text-sm">
            <summary className="flex min-h-8 cursor-pointer items-center text-ink-2">표로 보기</summary>
            <div className="overflow-x-auto">
              <table className="mono mt-2 w-full min-w-[480px] text-right text-xs">
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
                      <td>{ratioOf(d) == null ? "-" : `${Math.round(ratioOf(d)!)}%`}</td>
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

function MiniStat({ label, value, unit, sub, tone: t }: { label: string; value: string; unit: string; sub: string | null; tone: "up" | "down" | "muted" }) {
  return (
    <div className="panel min-w-0 px-2.5 py-2.5">
      <div className="cap truncate">{label}</div>
      <div className="mono mt-0.5 text-[17px] font-semibold">
        {value}<span className="text-xs text-ink-2">{unit}</span>
      </div>
      {sub && <div className={`mono truncate text-[11px] ${toneCls[t]}`}>{sub}</div>}
    </div>
  );
}

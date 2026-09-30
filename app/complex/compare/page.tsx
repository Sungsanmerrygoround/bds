import Link from "next/link";
import { CompareCharts, type CompareSeries } from "../../_components/CompareCharts";
import { Dimmed, FilterScope, OptionList, RailLayout, RangeList } from "../../_components/Filters";
import { AREA_BAND_LABEL, BAND_OPTIONS, bandText, bandValue, parseBand } from "@/lib/area";
import { getFavorites, isValidAptSeq } from "@/lib/favorites";
import { formatEok, formatYm } from "@/lib/format";
import { groupColor } from "@/lib/groups";
import { getComplexes, getComplexRents, getComplexTrades, searchComplexes } from "@/lib/queries";
import { addMonths, currentYm, lastCompleteYm, monthsBetween, partialFromYm, rangeLabel, resolveRange } from "@/lib/range";
import { median, rollingMedian } from "@/lib/stats";

// 단지 비교: 최대 5개 단지의 같은 면적 구간 가격을 한 차트에.
// 단지는 한 달 거래가 적어 달마다 '그 달 포함 최근 3개월 거래의 중위값'으로 그린다.

const MAX = 5;
const ymOf = (date: string) => date.slice(0, 4) + date.slice(5, 7);

export default async function ComplexComparePage({ searchParams }: PageProps<"/complex/compare">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const ids = [...new Set((str("ids") ?? "").split(",").filter(isValidAptSeq))].slice(0, MAX);
  const range = resolveRange(sp);
  const band = parseBand(sp.band);
  const metric = str("metric") === "jeonse" ? "jeonse" : "trade";
  const mode = str("view") === "index" ? "index" : "price";
  const q = str("q")?.trim() ?? "";

  const from3 = addMonths(range.from, -2); // 이동 중위의 첫 달을 위해 2개월 앞부터
  const favs = await getFavorites();
  const [complexes, found, data] = await Promise.all([
    getComplexes([...new Set([...ids, ...favs])]), // 관심 단지 이름(추가 버튼)도 한 번에
    q ? searchComplexes(q, null) : Promise.resolve([]),
    Promise.all(ids.map((id) => Promise.all([getComplexTrades(id, from3, range.to), getComplexRents(id, from3, range.to)]))),
  ]);
  const byId = new Map(complexes.map((c) => [c.apt_seq, c]));
  const valid = ids.filter((id) => byId.has(id));

  const months = monthsBetween(range.from, range.to);
  const windowMonths = monthsBetween(from3, range.to);
  const partialYm = partialFromYm();
  const pi = months.findIndex((m) => m >= partialYm);
  const partialFrom = pi < 0 ? months.length : pi;
  const inBand = (b: number | null) => band == null || b === band;
  const lastDone = lastCompleteYm();
  const recentFrom = addMonths(lastDone, -2);

  const rows = valid.map((id) => {
    const [trades, rents] = data[ids.indexOf(id)];
    const t = trades.filter((r) => !r.is_cancelled && !r.missing_since && inBand(r.area_band));
    const j = rents.filter((r) => r.rent_type === "전세" && inBand(r.area_band));
    const deals = metric === "trade" ? t.map((r) => ({ ym: ymOf(r.deal_date), price: r.price_man })) : j.map((r) => ({ ym: ymOf(r.deal_date), price: r.deposit_man }));
    const rolled = rollingMedian(windowMonths, deals).slice(2);
    const counts = months.map((m) => deals.filter((d) => d.ym === m).length);
    const tr = t.filter((r) => ymOf(r.deal_date) >= range.from);
    const isRecent = (r: { deal_date: string }) => ymOf(r.deal_date) >= recentFrom && ymOf(r.deal_date) <= lastDone;
    const recentTrade = median(t.filter(isRecent).map((r) => r.price_man));
    const recentJeonse = median(j.filter(isRecent).map((r) => r.deposit_man));
    const peak = tr.reduce<typeof t[number] | null>((m, r) => (!m || r.price_man > m.price_man ? r : m), null);
    return { id, c: byId.get(id)!, rolled, counts, tradeN: tr.length, jeonseN: j.filter((r) => ymOf(r.deal_date) >= range.from).length, last: t[0], recentTrade, recentJeonse, peak };
  });

  const series: CompareSeries[] = rows.map((r, i) => ({ id: r.id, name: r.c.apt_nm, color: groupColor(i), price: r.rolled, count: r.counts }));
  const hasData = series.some((s) => s.price.some((v) => v != null));
  const kind = metric === "trade" ? "매매" : "전세";

  const keep = (next: string[]) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "ids" && k !== "q") p.set(k, v);
    if (next.length) p.set("ids", next.join(","));
    return `/complex/compare?${p.toString()}`;
  };
  const addable = (id: string) => !valid.includes(id) && valid.length < MAX;
  const favChoices = favs.filter(addable);

  return (
    <FilterScope>
      <Link href="/complex" className="text-sm text-ink-2 hover:underline">← 단지</Link>
      <h1 className="mb-3 mt-2 text-xl font-semibold">단지 비교</h1>

      <section className="panel mb-4 flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="cap mr-1">비교 중 {valid.length}/{MAX}</span>
          {rows.map((r, i) => (
            <span key={r.id} className="flex min-h-9 items-center gap-2 rounded border border-line bg-surface-2 pl-3 text-sm">
              <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: groupColor(i) }} />
              <Link href={`/complex/${encodeURIComponent(r.id)}`} className="hover:underline">{r.c.apt_nm}</Link>
              <Link href={keep(valid.filter((x) => x !== r.id))} aria-label={`${r.c.apt_nm} 빼기`} className="flex h-9 w-9 items-center justify-center text-muted hover:text-ink">✕</Link>
            </span>
          ))}
          {valid.length === 0 && <span className="text-sm text-muted">아래에서 단지를 검색해 추가하세요.</span>}
        </div>
        {valid.length < MAX && (
          <form action="/complex/compare" className="flex flex-wrap items-center gap-2">
            {Object.entries(sp).map(([k, v]) => (typeof v === "string" && k !== "q" ? <input key={k} type="hidden" name={k} value={k === "ids" ? valid.join(",") : v} /> : null))}
            <input name="q" defaultValue={q} placeholder="단지명으로 추가 (예: 헬리오시티)" aria-label="추가할 단지 검색"
              className="min-h-10 w-64 max-w-full rounded border border-line bg-surface-2 px-2.5 text-sm text-ink" />
            <button className="min-h-10 rounded border border-line px-3 text-sm hover:bg-wash">검색</button>
          </form>
        )}
        {q && (
          <div className="flex flex-wrap gap-1.5">
            {found.filter((f) => addable(f.apt_seq)).slice(0, 12).map((f) => (
              <Link key={f.apt_seq} href={keep([...valid, f.apt_seq])} className="rounded border border-line px-2.5 py-1.5 text-sm hover:bg-wash">
                + {f.apt_nm} <span className="text-xs text-muted">{f.sigungu_name} {f.umd_nm}</span>
              </Link>
            ))}
            {found.length === 0 && <span className="text-sm text-muted">&apos;{q}&apos; 검색 결과가 없습니다.</span>}
          </div>
        )}
        {favChoices.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="cap mr-1">관심 단지</span>
            {favChoices.slice(0, 10).map((id) => (
              <Link key={id} href={keep([...valid, id])} className="rounded border border-line px-2.5 py-1.5 text-sm text-ink-2 hover:bg-wash">
                + {byId.get(id)?.apt_nm ?? id}
              </Link>
            ))}
          </div>
        )}
      </section>

      <RailLayout
        summary={[bandText(band), kind, rangeLabel(range), mode === "price" ? "가격" : "지수"]}
        rail={
          <>
            <OptionList label="가격" param="metric" value={metric} cols={2}
              options={[{ value: "trade", label: "매매" }, { value: "jeonse", label: "전세" }]} />
            <OptionList label="보기" param="view" value={mode} cols={2}
              options={[{ value: "price", label: "가격", aside: "억 원" }, { value: "index", label: "지수", aside: "첫 3개월=100" }]} />
            <OptionList label="전용면적" param="band" value={bandValue(band)} cols={4} options={BAND_OPTIONS} />
            <RangeList rangeKey={range.key} from={range.from} to={range.to} max={currentYm()} />
          </>
        }
      >
        <Dimmed className="flex flex-col gap-4">
          <p className="hidden text-sm text-ink-2 lg:block">
            {kind} · {band == null ? "전체 면적" : AREA_BAND_LABEL[band]} · <span className="mono">{formatYm(range.from)} – {formatYm(range.to)}</span>
            <span className="text-muted"> · 달마다 그 달 포함 최근 3개월 거래의 중위값</span>
          </p>

          {valid.length === 0 ? null : hasData ? (
            <CompareCharts months={months} partialFrom={partialFrom} series={series} mode={mode}
              labels={{ price: `단지별 ${kind} 가격 (3개월 이동 중위)`, count: `단지별 월별 ${kind} 거래량`, noun: "단지" }} />
          ) : (
            <p className="panel py-16 text-center text-sm text-muted">이 면적·기간에 {kind} 거래가 없습니다. 전용면적을 바꿔 보세요.</p>
          )}

          {rows.length > 0 && (
            <div className="panel overflow-x-auto">
              <table className="mono w-full min-w-[760px] text-[13px]">
                <thead className="text-xs text-muted">
                  <tr className="text-right">
                    <th className="px-3 py-2 text-left font-normal">단지 · {bandText(band)}</th>
                    <th className="px-2 font-normal">준공</th>
                    <th className="px-2 font-normal">기간 매매/전세</th>
                    <th className="px-2 font-normal">최근 매매</th>
                    <th className="px-2 font-normal">최근 3개월 매매 중위</th>
                    <th className="px-2 font-normal">전세 중위</th>
                    <th className="px-2 font-normal">전세가율</th>
                    <th className="px-3 font-normal">기간 최고가</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className="border-t border-line text-right">
                      <td className="px-3 py-2 text-left font-sans">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: groupColor(i) }} />
                        <Link href={`/complex/${encodeURIComponent(r.id)}`} className="font-medium hover:underline">{r.c.apt_nm}</Link>
                        <span className="ml-1.5 text-xs text-muted">{r.c.regions.sigungu_name} {r.c.umd_nm}</span>
                      </td>
                      <td className="px-2 text-ink-2">{r.c.build_year ?? "-"}</td>
                      <td className="px-2">{r.tradeN} / {r.jeonseN}</td>
                      <td className="px-2">
                        {formatEok(r.last?.price_man)}
                        {r.last && <div className="text-[11px] text-muted">{r.last.deal_date} · {r.last.area_type}㎡</div>}
                      </td>
                      <td className="px-2 font-medium">{formatEok(r.recentTrade)}</td>
                      <td className="px-2">{formatEok(r.recentJeonse)}</td>
                      <td className="px-2">{r.recentTrade && r.recentJeonse ? `${Math.round((r.recentJeonse / r.recentTrade) * 100)}%` : "-"}</td>
                      <td className="px-3">
                        {formatEok(r.peak?.price_man)}
                        {r.peak && <div className="text-[11px] text-muted">{r.peak.deal_date}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 pb-2 text-[11px] text-muted">최근 3개월 = 집계가 끝난 최근 3개월. 면적 구간 안 모든 타입 포함.</p>
            </div>
          )}
        </Dimmed>
      </RailLayout>
    </FilterScope>
  );
}


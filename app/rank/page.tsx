import Link from "next/link";
import { Dimmed, FilterScope, OptionList, RailLayout } from "../_components/Filters";
import { FavButton } from "../_components/FavButton";
import { BAND_OPTIONS, bandText, bandValue, parseBand } from "@/lib/area";
import { getFavorites } from "@/lib/favorites";
import { formatEok, formatPct, formatYm, shortYm } from "@/lib/format";
import { getGroups, getRank, type RankRow } from "@/lib/queries";
import { addMonths, DATA_START, lastCompleteYm } from "@/lib/range";
import { pctChange } from "@/lib/stats";

// 단지 순위: 집계가 끝난 최근 12개월 기준.
// 1년 변동 = 최근 3개월 중위 ÷ 1년 전 같은 3개월 중위 (양쪽 2건 이상일 때만)
// 최고가 대비 = 최근 3개월 중위(없으면 12개월 중위) ÷ 보관 기간(5년) 최고 거래가

const SORTS = [
  { value: "ppa", label: "평당가", aside: "3.3㎡당" },
  { value: "chg", label: "1년 변동", aside: "3개월 중위" },
  { value: "vol", label: "거래량", aside: "12개월" },
  { value: "peak", label: "최고가 대비", aside: "낮은 순" },
];
const MINS = [
  { value: "1", label: "1건+" },
  { value: "3", label: "3건+" },
  { value: "5", label: "5건+" },
  { value: "10", label: "10건+" },
];
const LIMIT = 100;

interface Ranked extends RankRow {
  chg: number | null;
  peakRatio: number;
  current: number;
}

export default async function RankPage({ searchParams }: PageProps<"/rank">) {
  const sp = await searchParams;
  const band = parseBand(sp.band);
  const sort = SORTS.find((s) => s.value === sp.sort)?.value ?? "ppa";
  const min = MINS.find((m) => m.value === sp.min)?.value ?? "3";
  const [groups, favs] = await Promise.all([getGroups(), getFavorites()]);
  const group = groups.find((g) => String(g.id) === sp.g) ?? null;

  const end = lastCompleteYm();
  const rows = await getRank(group?.id ?? null, band, end);

  const ranked: Ranked[] = rows
    .filter((r) => r.trades_12m >= Number(min))
    .map((r) => {
      const current = r.recent_count > 0 ? r.recent_median! : r.median_12m;
      return {
        ...r,
        current,
        chg: r.recent_count >= 2 && r.year_ago_count >= 2 ? pctChange(r.recent_median, r.year_ago_median) : null,
        peakRatio: (current / r.peak_price) * 100,
      };
    });
  const key: Record<string, (r: Ranked) => number | null> = {
    ppa: (r) => r.ppa_12m,
    chg: (r) => r.chg,
    vol: (r) => r.trades_12m,
    peak: (r) => -r.peakRatio,
  };
  const k = key[sort];
  ranked.sort((a, b) => (k(b) ?? -Infinity) - (k(a) ?? -Infinity) || b.trades_12m - a.trades_12m);
  const shown = ranked.slice(0, LIMIT);
  const favSet = new Set(favs);
  const period = `${shortYm(addMonths(end, -11))}–${shortYm(end)}`;

  return (
    <FilterScope>
      <h1 className="sr-only">단지 순위</h1>
      <RailLayout
        summary={[group?.name ?? "전체 지역", bandText(band), SORTS.find((s) => s.value === sort)!.label]}
        rail={
          <>
            <OptionList label="지역" param="g" value={group ? String(group.id) : "all"} cols={2}
              options={[{ value: "all", label: "전체" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
            <OptionList label="전용면적" param="band" value={bandValue(band)} cols={4} options={BAND_OPTIONS} />
            <OptionList label="정렬" param="sort" value={sort} cols={2} options={SORTS} />
            <OptionList label="12개월 매매 최소" param="min" value={min} cols={4} options={MINS} />
          </>
        }
      >
        <Dimmed className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            {group?.name ?? "전체 지역"} · {bandText(band)} · <span className="mono">{period}</span> 매매 기준 {ranked.length}개 단지
            {ranked.length > LIMIT && ` 중 상위 ${LIMIT}개`}
            <span className="text-muted"> · 1년 변동은 최근 3개월과 1년 전 같은 3개월 중위가 비교(양쪽 2건 이상) · 최고가는 {formatYm(DATA_START)} 이후</span>
          </p>
          <div className="panel overflow-x-auto">
            <table className="mono w-full min-w-[820px] text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="w-10 px-2 py-2 text-left font-normal">#</th>
                  <th className="text-left font-normal">단지</th>
                  <th className="px-2 font-normal">준공</th>
                  <th className={`px-2 font-normal ${sort === "ppa" ? "text-ink" : ""}`}>3.3㎡당</th>
                  <th className="px-2 font-normal">12개월 중위</th>
                  <th className={`px-2 font-normal ${sort === "chg" ? "text-ink" : ""}`}>1년 변동</th>
                  <th className={`px-2 font-normal ${sort === "vol" ? "text-ink" : ""}`}>거래</th>
                  <th className={`w-48 px-3 font-normal ${sort === "peak" ? "text-ink" : ""}`}>최고가 대비</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.apt_seq} className="border-t border-line text-right hover:bg-wash">
                    <td className="px-2 py-2 text-left text-muted">{i + 1}</td>
                    <td className="text-left font-sans">
                      <span className="flex items-center gap-1">
                        <FavButton aptSeq={r.apt_seq} on={favSet.has(r.apt_seq)} name={r.apt_nm} />
                        <span className="min-w-0">
                          <Link href={`/complex/${encodeURIComponent(r.apt_seq)}`} className="font-medium hover:underline">{r.apt_nm}</Link>
                          <span className="ml-1.5 text-xs text-muted">{r.sigungu_name} {r.umd_nm}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-2 text-ink-2">{r.build_year ?? "-"}</td>
                    <td className="px-2 font-medium">{(r.ppa_12m / 10000).toFixed(2)}억</td>
                    <td className="px-2">{formatEok(r.median_12m)}</td>
                    <td className={`px-2 ${r.chg == null ? "text-muted" : r.chg >= 0 ? "text-up" : "text-down"}`}>{formatPct(r.chg)}</td>
                    <td className="px-2">{r.trades_12m}</td>
                    <td className="px-3">
                      <div className="flex items-center justify-end gap-2" title={`최고가 ${formatEok(r.peak_price)} (${r.peak_date})`}>
                        <span className="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-tag sm:block" aria-hidden="true">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-s1" style={{ width: `${Math.min(100, r.peakRatio)}%` }} />
                        </span>
                        <span className="w-12">{r.peakRatio.toFixed(0)}%</span>
                      </div>
                      <div className="text-[11px] text-muted">{formatEok(r.peak_price)} · {r.peak_date.slice(2, 7).replace("-", ".")}</div>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-muted">조건에 맞는 단지가 없습니다.</td></tr>}
              </tbody>
            </table>
          </div>
        </Dimmed>
      </RailLayout>
    </FilterScope>
  );
}

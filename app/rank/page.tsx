import { Dimmed, FilterScope, OptionList, RailLayout } from "../_components/Filters";
import { ComplexLink, EmptyRow, toneText } from "../_components/ui";
import { BAND_OPTIONS, bandText, bandValue, parseBand } from "@/lib/area";
import { getFavorites } from "@/lib/favorites";
import { deltaTone, formatCount, formatEok, formatPct, formatYm, shortYm } from "@/lib/format";
import { findGroup, findOption, groupLabel, groupOptions, groupValue } from "@/lib/params";
import { getGroups, getRank } from "@/lib/queries";
import { addMonths, DATA_START, lastCompleteYm, ymOfDate } from "@/lib/range";
import { deriveRank, JEONSE_MIN, sortRanked, type RankSort } from "@/lib/rank";

// 단지 순위: 집계가 끝난 최근 12개월 기준. 지표 정의는 lib/rank.ts

const SORTS: { value: RankSort; label: string; aside: string }[] = [
  { value: "ppa", label: "평당가", aside: "3.3㎡당" },
  { value: "chg", label: "1년 변동", aside: "3개월 중위" },
  { value: "vol", label: "거래량", aside: "12개월" },
  { value: "peak", label: "최고가 대비", aside: "낮은 순" },
  { value: "ratio", label: "전세가율", aside: "높은 순" },
  { value: "gap", label: "갭", aside: "작은 순" },
];
const MINS = [
  { value: "1", label: "1건+" },
  { value: "3", label: "3건+" },
  { value: "5", label: "5건+" },
  { value: "10", label: "10건+" },
];
const HOUSEHOLDS = [
  { value: "all", label: "전체" },
  { value: "300", label: "300+" },
  { value: "500", label: "500+" },
  { value: "1000", label: "1000+" },
];
const LIMIT = 100;

export default async function RankPage({ searchParams }: PageProps<"/rank">) {
  const sp = await searchParams;
  const band = parseBand(sp.band);
  const sortOpt = findOption(SORTS, sp.sort) ?? SORTS[0];
  const sort = sortOpt.value;
  const min = findOption(MINS, sp.min)?.value ?? "3";
  const hh = findOption(HOUSEHOLDS, sp.hh)?.value ?? "all";
  const [groups, favs] = await Promise.all([getGroups(), getFavorites()]);
  const group = findGroup(groups, sp.g) ?? null;

  const end = lastCompleteYm();
  const rows = await getRank(group?.id ?? null, band, end);

  const ranked = sortRanked(
    rows.filter((r) => r.trades_12m >= Number(min) && (hh === "all" || (r.households ?? 0) >= Number(hh))).map(deriveRank),
    sort,
  );
  const shown = ranked.slice(0, LIMIT);
  const favSet = new Set(favs);
  const period = `${shortYm(addMonths(end, -11))}–${shortYm(end)}`;

  return (
    <FilterScope>
      <h1 className="sr-only">단지 순위</h1>
      <RailLayout
        summary={[groupLabel(group), bandText(band), sortOpt.label, ...(hh === "all" ? [] : [`${hh}세대+`])]}
        rail={
          <>
            <OptionList label="지역" param="g" value={groupValue(group?.id)} cols={2} options={groupOptions(groups)} />
            <OptionList label="전용면적" param="band" value={bandValue(band)} cols={4} options={BAND_OPTIONS} />
            <OptionList label="정렬" param="sort" value={sort} cols={2} options={SORTS} />
            <OptionList label="12개월 매매 최소" param="min" value={min} cols={4} options={MINS} />
            <OptionList label="세대수" param="hh" value={hh} cols={4} options={HOUSEHOLDS} />
          </>
        }
      >
        <Dimmed className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            {groupLabel(group)} · {bandText(band)} · <span className="mono">{period}</span> 매매 기준 {ranked.length}개 단지
            {ranked.length > LIMIT && ` 중 상위 ${LIMIT}개`}
            <span className="text-muted"> · 1년 변동은 최근 3개월과 1년 전 같은 3개월 중위가 비교(양쪽 2건 이상) · 최고가는 {formatYm(DATA_START)} 이후
              · 세대수는 K-apt(의무관리 단지만) · 회전율은 단지 전체 면적 12개월 매매 ÷ 세대수{hh !== "all" && " · 세대수 필터는 세대수를 아는 단지만"}
              · 전세가율·갭은 12개월 매매 중위와 전세 중위(갱신 제외, {JEONSE_MIN}건 이상) 비교
              {band == null && " — 전체 면적에서는 매매와 전세의 면적 구성이 달라 어긋날 수 있으니 면적을 골라 보세요"}</span>
          </p>
          <div className="panel overflow-x-auto">
            <table className="mono w-full min-w-[1040px] text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="w-10 px-2 py-2 text-left font-normal">#</th>
                  <th className="text-left font-normal">단지</th>
                  <th className="px-2 font-normal">준공</th>
                  <th className="px-2 font-normal">세대수</th>
                  <th className={`px-2 font-normal ${sort === "ppa" ? "text-ink" : ""}`}>3.3㎡당</th>
                  <th className="px-2 font-normal">12개월 중위</th>
                  <th className="px-2 font-normal" title="같은 면적 구간 12개월 전세 중위 (갱신 계약 제외)">전세 중위</th>
                  <th className={`px-2 font-normal ${sort === "ratio" ? "text-ink" : ""}`}>전세가율</th>
                  <th className={`px-2 font-normal ${sort === "gap" ? "text-ink" : ""}`} title="12개월 매매 중위 − 전세 중위">갭</th>
                  <th className={`px-2 font-normal ${sort === "chg" ? "text-ink" : ""}`}>1년 변동</th>
                  <th className={`px-2 font-normal ${sort === "vol" ? "text-ink" : ""}`}>거래</th>
                  <th className="px-2 font-normal" title="단지 전체 면적 12개월 매매 ÷ 세대수">회전율</th>
                  <th className={`w-40 px-3 font-normal ${sort === "peak" ? "text-ink" : ""}`}>최고가 대비</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.apt_seq} className="border-t border-line text-right hover:bg-wash">
                    <td className="px-2 py-2 text-left text-muted">{i + 1}</td>
                    <td className="text-left font-sans">
                      <ComplexLink aptSeq={r.apt_seq} name={r.apt_nm} where={`${r.sigungu_name} ${r.umd_nm ?? ""}`} fav={favSet.has(r.apt_seq)} />
                    </td>
                    <td className="px-2 text-ink-2">{r.build_year ?? "-"}</td>
                    <td className="px-2 text-ink-2">{formatCount(r.households)}</td>
                    <td className="px-2 font-medium">{(r.ppa_12m / 10000).toFixed(2)}억</td>
                    <td className="px-2">{formatEok(r.median_12m)}</td>
                    <td className="px-2 text-ink-2" title={`전세 ${r.jeonse_count_12m}건 (갱신 제외)`}>{formatEok(r.jeonse)}</td>
                    <td className="px-2">{r.ratio == null ? "-" : `${r.ratio.toFixed(0)}%`}</td>
                    <td className="px-2">{formatEok(r.gap)}</td>
                    <td className={`px-2 ${toneText[deltaTone(r.chg)]}`}>{formatPct(r.chg)}</td>
                    <td className="px-2">{r.trades_12m}</td>
                    <td className="px-2 text-ink-2">{r.turnover == null ? "-" : `${r.turnover.toFixed(1)}%`}</td>
                    <td className="px-3">
                      <div className="flex items-center justify-end gap-2" title={`최고가 ${formatEok(r.peak_price)} (${r.peak_date})`}>
                        <span className="relative hidden h-1.5 w-16 overflow-hidden rounded-full bg-tag sm:block" aria-hidden="true">
                          <span className="absolute inset-y-0 left-0 rounded-full bg-s1" style={{ width: `${Math.min(100, r.peakRatio)}%` }} />
                        </span>
                        <span className="w-12">{r.peakRatio.toFixed(0)}%</span>
                      </div>
                      <div className="text-[11px] text-muted">{formatEok(r.peak_price)} · {shortYm(ymOfDate(r.peak_date))}</div>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <EmptyRow cols={13}>조건에 맞는 단지가 없습니다.</EmptyRow>}
              </tbody>
            </table>
          </div>
        </Dimmed>
      </RailLayout>
    </FilterScope>
  );
}

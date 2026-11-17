import { Dimmed, FilterBar, FilterScope, ParamSelect, ParamToggle } from "../_components/Filters";
import { Legend, SupplyChart, type SupplyPoint } from "../_components/Charts";
import { SupplyJeonse } from "../_components/SupplyJeonse";
import { Badge, Card, EmptyRow, PageHeader, Stat, toneText } from "../_components/ui";
import { DEFAULT_BAND } from "@/lib/area";
import { deltaTone, formatCount, formatEok, formatHouseholds, formatPct, formatYm, shortYm } from "@/lib/format";
import { findGroup, findOption, groupOptions, groupValue } from "@/lib/params";
import { getGroups, getSupply, getTrend } from "@/lib/queries";
import { groupColor } from "@/lib/groups";
import { addMonths, byMonth, currentYm, DATA_START, lastCompleteYm, maxYm, minYm, monthsBetween, partialIndex } from "@/lib/range";
import { REACTION_BEFORE, relocationByGroup, supplyByGroup, supplyReactions } from "@/lib/supply";

const HISTORY_AHEAD = 24; // 입주·전세 칸: 보관 시작 ~ 향후 2년
const REACTION_MIN = 500; // 이 세대 이상 입주한 달만 전후 비교

const WINDOWS = [
  { value: "12", label: "과거 1년 ~ 향후 3년", past: 12, future: 36 },
  { value: "0", label: "향후 3년", past: 0, future: 36 },
  { value: "36", label: "과거 3년 ~ 향후 3년", past: 36, future: 36 },
];

export default async function SupplyPage({ searchParams }: PageProps<"/supply">) {
  const sp = await searchParams;
  const groups = await getGroups();
  const groupId = findGroup(groups, sp.g)?.id ?? null;
  const win = findOption(WINDOWS, sp.w) ?? WINDOWS[0];
  const showExcluded = sp.excluded === "1";

  const now = currentYm();
  const from = addMonths(now, -win.past);
  const to = addMonths(now, win.future);
  const histTo = addMonths(now, HISTORY_AHEAD);
  // 위쪽 차트(선택 기간)와 아래 입주·전세 칸(보관 시작~향후 2년)을 한 번에 받는다
  const [{ projects: allProjects, manual: allManual }, jeonseRows] = await Promise.all([
    getSupply(minYm(from, DATA_START), maxYm(to, histTo)),
    Promise.all(groups.map((g) => getTrend(g.id, DEFAULT_BAND, DATA_START, now))),
  ]);
  const projects = allProjects.filter((p) => p.move_in_ym >= from && p.move_in_ym <= to);
  const manual = allManual.filter((m) => m.ym >= from && m.ym <= to);

  const regionToGroupId = new Map(groups.flatMap((g) => g.regions.map((r) => [r.id, g.id] as const)));
  const shownGroups = groups.filter((g) => groupId == null || g.id === groupId);
  const series = shownGroups.map((g) => ({ key: `g${g.id}`, label: g.name, color: groupColor(groups.indexOf(g)) }));
  const inScope = (regionId: number) => groupId == null || regionToGroupId.get(regionId) === groupId;

  // 위쪽 차트: 선택 기간 월별 그룹 세대
  const winMonths = monthsBetween(from, to);
  const winSupply = supplyByGroup(regionToGroupId, winMonths, projects, manual);
  // 이주(직접 입력한 재건축·재개발 이주)는 전세 수요라 차트에서 0 아래로 그린다
  const winMoveOut = relocationByGroup(regionToGroupId, winMonths, manual);
  const moveOutSeries = series
    .map((s, i) => ({ ...s, key: `out_${s.key}`, groupId: shownGroups[i].id }))
    .filter((s) => winMoveOut.get(s.groupId)!.some((n) => n > 0));
  const data: SupplyPoint[] = winMonths.map((ym, i) => {
    const pt: SupplyPoint = { ym };
    for (const g of shownGroups) pt[`g${g.id}`] = winSupply.get(g.id)![i];
    for (const s of moveOutSeries) pt[s.key] = -winMoveOut.get(s.groupId)![i];
    return pt;
  });
  const sumBetween = (by: Map<number, number[]>, a: string, b: string) =>
    winMonths.reduce((s, m, i) => (m >= a && m <= b ? s + shownGroups.reduce((x, g) => x + by.get(g.id)![i], 0) : s), 0);
  const nextYear = sumBetween(winSupply, addMonths(now, 1), addMonths(now, 12));
  const yearAfter = sumBetween(winSupply, addMonths(now, 13), addMonths(now, 24));
  const moveOutNextYear = sumBetween(winMoveOut, addMonths(now, 1), addMonths(now, 12));

  // 입주 전후 전세가
  const histMonths = monthsBetween(DATA_START, histTo);
  const supplyHist = supplyByGroup(regionToGroupId, histMonths, allProjects, allManual);
  const jeonseHist = new Map(groups.map((g, i) => [g.id, byMonth(histMonths, jeonseRows[i], (r) => r.jeonse_median)] as const));
  const histPartial = partialIndex(histMonths);
  const reactions = supplyReactions(histMonths, supplyHist, jeonseHist, histMonths.indexOf(lastCompleteYm()), REACTION_MIN)
    .filter((r) => groupId == null || r.groupId === groupId);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const panels = shownGroups.map((g) => ({
    id: g.id, name: g.name, color: groupColor(groups.indexOf(g)),
    supply: supplyHist.get(g.id)!, jeonse: jeonseHist.get(g.id)!,
  }));
  const offs = (a: readonly [number, number]) => `${Math.abs(a[0])}~${Math.abs(a[1])}`;

  // 목록: 청약홈 공고 + 직접 입력(manual_supply). 직접 입력은 공고에 안 잡히는 입주(조합원분 등)와 재건축·재개발 이주.
  const shownProjects = projects.filter((p) => inScope(p.region_id) && (showExcluded || !p.is_excluded));
  const shownManual = manual.filter((m) => inScope(m.region_id));
  const list = [
    ...shownProjects.map((p) => ({
      key: `p${p.house_manage_no}`, ym: p.move_in_ym, name: p.house_nm, url: p.pblanc_url, regionId: p.region_id,
      households: p.total_households_override ?? p.households, muted: p.is_excluded, note: null as string | null, moveOut: false,
      tags: [
        p.house_secd_nm && p.house_secd_nm !== "APT" ? p.house_secd_nm : null,
        p.rent_secd_nm && p.rent_secd_nm !== "분양주택" ? p.rent_secd_nm : null,
        p.is_excluded ? `제외: ${p.exclude_reason}` : null,
      ].filter((t): t is string => !!t),
    })),
    ...shownManual.map((m) => ({
      key: `m${m.id}`, ym: m.ym, name: m.name, url: null, regionId: m.region_id,
      households: m.households, muted: false, note: m.note, moveOut: m.kind === "이주", tags: ["직접 입력"],
    })),
  ].sort((a, b) => a.ym.localeCompare(b.ym) || a.name.localeCompare(b.name, "ko")); // 이름 순은 서버 언어 설정과 관계없이 한국어 기준

  return (
    <FilterScope>
      <PageHeader title="입주 물량">
        청약홈 모집공고의 입주 예정월 기준. 세대수는 공급(분양)세대라 재건축·재개발은 조합원분이 빠져 실제보다 적습니다.
      </PageHeader>
      <FilterBar>
        <ParamSelect label="기간" param="w" value={win.value} options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
        <ParamSelect label="지역" param="g" value={groupValue(groupId)} options={groupOptions(groups)} />
        <ParamToggle label="제외된 공고도 목록에 표시" param="excluded" checked={showExcluded} />
      </FilterBar>

      <Dimmed>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="향후 12개월 입주" value={formatHouseholds(nextYear)} />
          <Stat label="그 다음 12개월" value={formatHouseholds(yearAfter)} />
          {moveOutNextYear > 0 && <Stat label="향후 12개월 이주" value={formatHouseholds(moveOutNextYear)} sub="재건축·재개발 이주 (직접 입력)" />}
        </div>

        <Card
          title="월별 입주 예정 세대"
          subtitle={moveOutSeries.length > 0 ? "0 아래 점선 막대 = 재건축·재개발 이주 세대(직접 입력). 이주는 주변 전세 수요를 늘립니다." : undefined}
          right={series.length > 1 ? <Legend items={series.map((s) => ({ color: s.color, label: s.label }))} /> : undefined}
        >
          <SupplyChart data={data} series={series} relocation={moveOutSeries} nowYm={now} />
        </Card>

        <section className="mb-4 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold">입주와 전세가</h2>
            <p className="mt-0.5 text-xs text-muted">
              지역별 전용 {DEFAULT_BAND}㎡ 전세 중위가(위, 갱신 제외 신규 계약)와 월별 입주 세대(아래). {REACTION_MIN}세대 이상 입주한 달은 위 칸에 점선으로 표시. 흐린 막대 = 앞으로 입주.
            </p>
          </div>
          <SupplyJeonse months={histMonths} partialFrom={histPartial} nowIdx={histMonths.indexOf(now)} panels={panels} />
          <div className="panel px-4 pb-3 pt-3.5">
            <h3 className="text-sm font-semibold">대규모 입주 전후 전세 변화</h3>
            <p className="mb-2 mt-0.5 text-xs text-muted">
              입주 {offs(REACTION_BEFORE)}개월 전 평균 → 입주 전월~익월 평균. 새 아파트 전세 계약은 입주 1~2개월 전에 몰려서(계약일 기준) 이 구간을 &apos;입주장&apos;으로 봅니다.
              {groups.length > 1 && <>&apos;지역 흐름 제외&apos;는 같은 기간 다른 지역(그 기간 전세 값이 있는 곳) 평균 변화를 뺀 값입니다.</>}
            </p>
            <div className="overflow-x-auto">
              <table className="mono w-full min-w-[620px] text-[13px]">
                <thead className="text-xs text-muted">
                  <tr className="text-right">
                    <th className="py-1 text-left font-normal">입주월</th>
                    <th className="text-left font-normal">지역</th>
                    <th className="font-normal">입주 세대</th>
                    <th className="font-normal">입주 전</th>
                    <th className="font-normal">입주장</th>
                    <th className="font-normal">변화</th>
                    <th className="font-normal">다른 지역</th>
                    <th className="font-normal">지역 흐름 제외</th>
                  </tr>
                </thead>
                <tbody>
                  {reactions.map((r) => (
                    <tr key={`${r.groupId}-${r.ym}`} className="border-t border-line text-right">
                      <td className="py-1.5 text-left">{shortYm(r.ym)}</td>
                      <td className="text-left font-sans">{groupName.get(r.groupId)}</td>
                      <td>{formatCount(r.households)}</td>
                      <td className="text-ink-2">{formatEok(r.before)}</td>
                      <td>{formatEok(r.around)}</td>
                      <td className={toneText[deltaTone(r.change)]}>{formatPct(r.change)}</td>
                      <td className="text-ink-2">{formatPct(r.others)}</td>
                      <td className={`font-medium ${r.excess == null ? "" : r.excess >= 0 ? "text-up" : "text-down"}`}>
                        {r.excess == null ? "-" : `${r.excess >= 0 ? "+" : ""}${r.excess.toFixed(1)}%p`}
                      </td>
                    </tr>
                  ))}
                  {reactions.length === 0 && <EmptyRow cols={8} className="py-8">비교할 수 있는 대규모 입주(한 달 {REACTION_MIN}세대 이상)가 없습니다.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <Card title={`공고 ${shownProjects.length}건${shownManual.length > 0 ? ` · 직접 입력 ${shownManual.length}건` : ""}`}>
          <div className="overflow-x-auto">
            <table className="mono w-full min-w-[640px] text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="py-1 text-left font-normal">{shownManual.some((m) => m.kind === "이주") ? "입주·이주월" : "입주 예정"}</th>
                  <th className="text-left font-normal">단지</th>
                  <th className="text-left font-normal">지역</th>
                  <th className="font-normal">세대</th>
                  <th className="text-left font-normal"><span className="pl-3">구분</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.key} className={`border-t border-line text-right ${r.muted ? "text-muted" : ""}`}>
                    <td className={`py-1.5 text-left ${r.ym < now ? "text-muted" : ""}`}>{formatYm(r.ym)}</td>
                    <td className="text-left font-sans">
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">{r.name}</a> : r.name}
                      {r.note && <span className="ml-1.5 text-xs text-muted">{r.note}</span>}
                    </td>
                    <td className="text-left font-sans text-ink-2">{groupName.get(regionToGroupId.get(r.regionId)!)}</td>
                    <td>{formatCount(r.households)}</td>
                    <td className="text-left">
                      <span className="inline-flex flex-wrap gap-1 pl-3">
                        {r.moveOut && <Badge tone="warn">이주</Badge>}
                        {r.tags.map((t) => <Badge key={t}>{t}</Badge>)}
                      </span>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && <EmptyRow cols={5}>이 기간에 입주 예정 공고가 없습니다.</EmptyRow>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            공고에 안 잡히는 입주(재건축 조합원분 등)와 재건축·재개발 이주는 DB의 manual_supply 표에 직접 넣으면 차트와 목록에 함께 나옵니다 (README의 &apos;입주 물량 직접 입력&apos;).
          </p>
        </Card>
      </Dimmed>
    </FilterScope>
  );
}

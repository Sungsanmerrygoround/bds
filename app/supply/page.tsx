import { Dimmed, FilterBar, FilterScope, ParamSelect, ParamToggle } from "../_components/Filters";
import { Legend, SupplyChart, type SupplyPoint } from "../_components/Charts";
import { SupplyJeonse } from "../_components/SupplyJeonse";
import { Badge, Card, Stat } from "../_components/ui";
import { DEFAULT_BAND } from "@/lib/area";
import { formatEok, formatPct, formatYm, shortYm } from "@/lib/format";
import { getGroups, getSupply, getTrend } from "@/lib/queries";
import { groupColor } from "@/lib/groups";
import { addMonths, currentYm, DATA_START, lastCompleteYm, monthsBetween, partialFromYm } from "@/lib/range";
import { REACTION_BEFORE, supplyByGroup, supplyReactions } from "@/lib/supply";

const HISTORY_AHEAD = 24; // 입주·전세 칸: 보관 시작 ~ 향후 2년
const REACTION_MIN = 500; // 이 세대 이상 입주한 달만 전후 비교

const WINDOWS = [
  { value: "12", label: "과거 1년 ~ 향후 3년", past: 12, future: 36 },
  { value: "0", label: "향후 3년", past: 0, future: 36 },
  { value: "36", label: "과거 3년 ~ 향후 3년", past: 36, future: 36 },
];

export default async function SupplyPage({ searchParams }: PageProps<"/supply">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const groups = await getGroups();
  const groupId = groups.find((g) => String(g.id) === str("g"))?.id ?? null;
  const win = WINDOWS.find((w) => w.value === str("w")) ?? WINDOWS[0];
  const showExcluded = str("excluded") === "1";

  const now = currentYm();
  const from = addMonths(now, -win.past);
  const to = addMonths(now, win.future);
  const histTo = addMonths(now, HISTORY_AHEAD);
  // 위쪽 차트(선택 기간)와 아래 입주·전세 칸(보관 시작~향후 2년)을 한 번에 받는다
  const [{ projects: allProjects, manual: allManual }, jeonseRows] = await Promise.all([
    getSupply([from, DATA_START].sort()[0], [to, histTo].sort()[1]),
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
  const data: SupplyPoint[] = winMonths.map((ym, i) => {
    const pt: SupplyPoint = { ym };
    for (const g of shownGroups) pt[`g${g.id}`] = winSupply.get(g.id)![i];
    return pt;
  });
  const sumBetween = (a: string, b: string) =>
    winMonths.reduce((s, m, i) => (m >= a && m <= b ? s + shownGroups.reduce((x, g) => x + winSupply.get(g.id)![i], 0) : s), 0);
  const nextYear = sumBetween(addMonths(now, 1), addMonths(now, 12));
  const yearAfter = sumBetween(addMonths(now, 13), addMonths(now, 24));

  // 입주 전후 전세가
  const histMonths = monthsBetween(DATA_START, histTo);
  const supplyHist = supplyByGroup(regionToGroupId, histMonths, allProjects, allManual);
  const jeonseHist = new Map(groups.map((g, i) => {
    const byYm = new Map(jeonseRows[i].map((r) => [r.ym, r.jeonse_median]));
    return [g.id, histMonths.map((m) => byYm.get(m) ?? null)] as const;
  }));
  const partialYm = partialFromYm();
  const histPartial = histMonths.indexOf(partialYm);
  const reactions = supplyReactions(histMonths, supplyHist, jeonseHist, histMonths.indexOf(lastCompleteYm()), REACTION_MIN)
    .filter((r) => groupId == null || r.groupId === groupId);
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const panels = shownGroups.map((g) => ({
    id: g.id, name: g.name, color: groupColor(groups.indexOf(g)),
    supply: supplyHist.get(g.id)!, jeonse: jeonseHist.get(g.id)!,
  }));
  const offs = (a: readonly [number, number]) => `${Math.abs(a[0])}~${Math.abs(a[1])}`;

  const list = projects
    .filter((p) => inScope(p.region_id) && (showExcluded || !p.is_excluded))
    .sort((a, b) => a.move_in_ym.localeCompare(b.move_in_ym) || a.house_nm.localeCompare(b.house_nm));

  return (
    <FilterScope>
      <h1 className="mb-1 text-2xl font-semibold">입주 물량</h1>
      <p className="mb-4 text-sm text-ink-2">
        청약홈 모집공고의 입주 예정월 기준. 세대수는 공급(분양)세대라 재건축·재개발은 조합원분이 빠져 실제보다 적습니다.
      </p>
      <FilterBar>
        <ParamSelect label="기간" param="w" value={win.value} options={WINDOWS.map((w) => ({ value: w.value, label: w.label }))} />
        <ParamSelect label="지역" param="g" value={groupId ? String(groupId) : "all"} options={[{ value: "all", label: "전체" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
        <ParamToggle label="제외된 공고도 목록에 표시" param="excluded" checked={showExcluded} />
      </FilterBar>

      <Dimmed>
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="향후 12개월 입주" value={`${nextYear.toLocaleString()}세대`} />
          <Stat label="그 다음 12개월" value={`${yearAfter.toLocaleString()}세대`} />
        </div>

        <Card title="월별 입주 예정 세대" right={series.length > 1 ? <Legend items={series.map((s) => ({ color: s.color, label: s.label }))} /> : undefined}>
          <SupplyChart data={data} series={series} nowYm={now} />
        </Card>

        <section className="mb-4 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold">입주와 전세가</h2>
            <p className="mt-0.5 text-xs text-muted">
              지역별 전용 {DEFAULT_BAND}㎡ 전세 중위가(위)와 월별 입주 세대(아래). {REACTION_MIN}세대 이상 입주한 달은 위 칸에 점선으로 표시. 흐린 막대 = 앞으로 입주.
            </p>
          </div>
          <SupplyJeonse months={histMonths} partialFrom={histPartial < 0 ? histMonths.length : histPartial} nowIdx={histMonths.indexOf(now)} panels={panels} />
          <div className="panel px-4 pb-3 pt-3.5">
            <h3 className="text-sm font-semibold">대규모 입주 전후 전세 변화</h3>
            <p className="mb-2 mt-0.5 text-xs text-muted">
              입주 {offs(REACTION_BEFORE)}개월 전 평균 → 입주 전월~익월 평균. 새 아파트 전세 계약은 입주 1~2개월 전에 몰려서(계약일 기준) 이 구간을 &apos;입주장&apos;으로 봅니다.
              &apos;지역 흐름 제외&apos;는 같은 기간 다른 4개 지역 평균 변화를 뺀 값입니다.
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
                      <td>{r.households.toLocaleString()}</td>
                      <td className="text-ink-2">{formatEok(r.before)}</td>
                      <td>{formatEok(r.around)}</td>
                      <td className={r.change >= 0 ? "text-up" : "text-down"}>{formatPct(r.change)}</td>
                      <td className="text-ink-2">{formatPct(r.others)}</td>
                      <td className={`font-medium ${r.excess == null ? "" : r.excess >= 0 ? "text-up" : "text-down"}`}>
                        {r.excess == null ? "-" : `${r.excess >= 0 ? "+" : ""}${r.excess.toFixed(1)}%p`}
                      </td>
                    </tr>
                  ))}
                  {reactions.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-muted">비교할 수 있는 대규모 입주(한 달 {REACTION_MIN}세대 이상)가 없습니다.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <Card title={`공고 ${list.length}건`}>
          <div className="overflow-x-auto">
            <table className="mono w-full min-w-[640px] text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="py-1 text-left font-normal">입주 예정</th>
                  <th className="text-left font-normal">단지</th>
                  <th className="text-left font-normal">지역</th>
                  <th className="font-normal">세대</th>
                  <th className="text-left font-normal"><span className="pl-3">구분</span></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.house_manage_no} className={`border-t border-line text-right ${p.is_excluded ? "text-muted" : ""}`}>
                    <td className={`py-1.5 text-left ${p.move_in_ym < now ? "text-muted" : ""}`}>{formatYm(p.move_in_ym)}</td>
                    <td className="text-left font-sans">
                      {p.pblanc_url ? <a href={p.pblanc_url} target="_blank" rel="noreferrer" className="hover:underline">{p.house_nm}</a> : p.house_nm}
                    </td>
                    <td className="text-left font-sans text-ink-2">{groupName.get(regionToGroupId.get(p.region_id)!)}</td>
                    <td>{(p.total_households_override ?? p.households).toLocaleString()}</td>
                    <td className="text-left">
                      <span className="inline-flex flex-wrap gap-1 pl-3">
                        {p.house_secd_nm && p.house_secd_nm !== "APT" && <Badge>{p.house_secd_nm}</Badge>}
                        {p.rent_secd_nm && p.rent_secd_nm !== "분양주택" && <Badge>{p.rent_secd_nm}</Badge>}
                        {p.is_excluded && <Badge>제외: {p.exclude_reason}</Badge>}
                      </span>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-muted">이 기간에 입주 예정 공고가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Dimmed>
    </FilterScope>
  );
}

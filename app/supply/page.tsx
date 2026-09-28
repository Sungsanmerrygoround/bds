import { Dimmed, FilterBar, FilterScope, ParamSelect, ParamToggle } from "../_components/Filters";
import { Legend, SupplyChart, type SupplyPoint } from "../_components/Charts";
import { Badge, Card, Stat } from "../_components/ui";
import { formatYm } from "@/lib/format";
import { getGroups, getSupply } from "@/lib/queries";
import { addMonths, currentYm, monthsBetween } from "@/lib/range";

// 지역 그룹 색: 그룹 정렬 순서로 고정(필터로 개수가 바뀌어도 색이 바뀌지 않음)
const GROUP_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

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
  const { projects, manual } = await getSupply(from, to);

  const regionToGroup = new Map(groups.flatMap((g) => g.regions.map((r) => [r.id, g] as const)));
  const shownGroups = groups.filter((g) => groupId == null || g.id === groupId);
  const series = shownGroups.map((g) => ({ key: `g${g.id}`, label: g.name, color: GROUP_COLORS[groups.indexOf(g) % GROUP_COLORS.length] }));

  const inScope = (regionId: number) => groupId == null || regionToGroup.get(regionId)?.id === groupId;
  const counted = projects.filter((p) => !p.is_excluded && inScope(p.region_id));
  const manualIn = manual.filter((m) => m.kind === "입주" && inScope(m.region_id));

  const data: SupplyPoint[] = monthsBetween(from, to).map((ym) => {
    const pt: SupplyPoint = { ym };
    for (const s of series) pt[s.key] = 0;
    return pt;
  });
  const byYm = new Map(data.map((d) => [d.ym, d]));
  const add = (ym: string, regionId: number, n: number) => {
    const g = regionToGroup.get(regionId);
    const pt = byYm.get(ym);
    if (g && pt && `g${g.id}` in pt) pt[`g${g.id}`] = Number(pt[`g${g.id}`]) + n;
  };
  for (const p of counted) add(p.move_in_ym, p.region_id, p.total_households_override ?? p.households);
  for (const m of manualIn) add(m.ym, m.region_id, m.households);

  const sumBetween = (a: string, b: string) =>
    data.filter((d) => d.ym >= a && d.ym <= b).reduce((s, d) => s + series.reduce((x, k) => x + Number(d[k.key]), 0), 0);
  const nextYear = sumBetween(addMonths(now, 1), addMonths(now, 12));
  const yearAfter = sumBetween(addMonths(now, 13), addMonths(now, 24));

  const list = projects
    .filter((p) => inScope(p.region_id) && (showExcluded || !p.is_excluded))
    .sort((a, b) => a.move_in_ym.localeCompare(b.move_in_ym) || a.house_nm.localeCompare(b.house_nm));

  return (
    <FilterScope>
      <h1 className="mb-1 text-xl font-semibold">입주 물량</h1>
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

        <Card title={`공고 ${list.length}건`}>
          <div className="overflow-x-auto">
            <table className="tnum w-full min-w-[640px] text-sm">
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
                    <td className="text-left">
                      {p.pblanc_url ? <a href={p.pblanc_url} target="_blank" rel="noreferrer" className="hover:underline">{p.house_nm}</a> : p.house_nm}
                    </td>
                    <td className="text-left text-ink-2">{regionToGroup.get(p.region_id)?.name}</td>
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

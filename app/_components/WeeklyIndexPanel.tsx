import { WeeklyChart, type WeeklySeries } from "./WeeklyChart";
import { changePct } from "@/lib/chart";
import { signedPct } from "@/lib/format";
import { getWeeklyIndex, type RegionGroup } from "@/lib/queries";
import { monthEnd, monthStart } from "@/lib/range";

// 추이 화면의 부동산원 주간 지수: 실거래(한 달 이상 늦음)보다 빠른 흐름.
// 지역 그룹의 구마다 한 선 (구성남은 수정구 실선 + 중원구 점선). 매매·전세는 차트를 나눈다.

const KINDS = [
  { kind: "sale", label: "매매", color: "var(--series-1)" },
  { kind: "jeonse", label: "전세", color: "var(--series-2)" },
] as const;
const PERIODS: { back: number; label: string; wide?: boolean }[] = [
  { back: 1, label: "전주 대비" },
  { back: 4, label: "4주" },
  { back: 13, label: "3개월", wide: true }, // 좁은 화면에서는 숨김
  { back: 52, label: "1년" },
];
const TABLE_WEEKS = 12;

const signed = (v: number | null) => signedPct(v, 2);
const toneCls = (v: number | null) => (v == null || v === 0 ? "text-muted" : v > 0 ? "text-up" : "text-down");
const shortGu = (name: string) => name.split(" ").at(-1)!;

export async function WeeklyIndexPanel({ group, from, to }: { group: RegionGroup; from: string; to: string }) {
  // 1년 변동 계산용으로 기간 앞 1년도 받는다
  const fetchFrom = new Date(Date.parse(monthStart(from)) - 371 * 86400_000).toISOString().slice(0, 10);
  const rows = await getWeeklyIndex(group.regions.map((r) => r.id), ["sale", "jeonse"], fetchFrom, monthEnd(to));
  if (rows.length === 0) return null;

  const allWeeks = [...new Set(rows.map((r) => r.week_date))].sort();
  const start = allWeeks.findIndex((d) => d >= monthStart(from));
  const weeks = start < 0 ? [] : allWeeks.slice(start);
  const multi = group.regions.length > 1;
  const valuesOf = (regionId: number, kind: string) => {
    const m = new Map(rows.filter((r) => r.region_id === regionId && r.kind === kind).map((r) => [r.week_date, r.value]));
    return allWeeks.map((d) => m.get(d) ?? null);
  };
  const lines = KINDS.flatMap((k) => group.regions.map((r, j) => ({
    kind: k, region: r, dashed: j > 0, full: valuesOf(r.id, k.kind),
  })));
  const last = allWeeks.length - 1;
  const lastWeek = allWeeks[last];

  return (
    <section className="flex flex-col gap-3" aria-label="부동산원 주간 가격지수">
      <div className="grid gap-4 xl:grid-cols-2">
        {KINDS.map((k) => {
          const series: WeeklySeries[] = lines.filter((l) => l.kind === k).map((l) => ({
            key: `${l.region.id}`,
            label: multi ? `${k.label} ${shortGu(l.region.sigungu_name)}` : `${k.label}지수`,
            color: k.color,
            dashed: l.dashed,
            values: l.full.slice(start),
          }));
          return (
            <WeeklyChart key={k.kind} title={`주간 ${k.label}가격지수`} unit="한국부동산원" weeks={weeks} series={series} height={180}
              note={`매주 목요일 발표 · 괄호는 전주 대비`} />
          );
        })}
      </div>

      <div className="panel overflow-x-auto px-4 py-3">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">주간 지수 변동 <span className="mono text-xs font-normal text-muted">{lastWeek} 주 기준</span></h2>
          {group.regions.length > 1 && <span className="text-[11px] text-muted">부동산원 지수는 구 전체 기준이라 실거래 집계의 법정동 제외(창곡동 등)는 반영되지 않습니다.</span>}
        </div>
        <table className="mono w-full text-right text-[13px]">
          <thead className="text-xs text-muted">
            <tr>
              <th className="py-1 text-left font-normal">지수</th>
              <th className="font-normal">지수 값</th>
              {PERIODS.map((p) => <th key={p.back} className={`font-normal ${p.wide ? "hidden sm:table-cell" : ""}`}>{p.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={`${l.kind.kind}-${l.region.id}`} className="border-t border-line">
                <td className="py-1.5 text-left font-sans">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: l.kind.color }} />
                  {l.kind.label} <span className="text-ink-2"><span className="hidden sm:inline">{l.region.sigungu_name}</span><span className="sm:hidden">{shortGu(l.region.sigungu_name)}</span></span>
                </td>
                <td>{l.full[last]?.toFixed(2) ?? "-"}</td>
                {PERIODS.map((p) => {
                  const c = changePct(l.full, last, p.back);
                  return <td key={p.back} className={`${toneCls(c)} ${p.wide ? "hidden sm:table-cell" : ""}`}>{signed(c)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="panel px-4 py-3 text-sm">
        <summary className="flex min-h-8 cursor-pointer items-center text-ink-2">주간 지수 표로 보기 (최근 {TABLE_WEEKS}주)</summary>
        <div className="overflow-x-auto">
          <table className="mono mt-2 w-full min-w-[560px] text-right text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1.5 text-left font-normal">주</th>
                {lines.map((l) => (
                  <th key={`${l.kind.kind}-${l.region.id}`} className="font-sans font-normal">
                    {l.kind.label}{multi ? ` ${shortGu(l.region.sigungu_name)}` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allWeeks.slice(-TABLE_WEEKS).map((d, k, shown) => {
                const i = allWeeks.length - shown.length + k;
                return (
                  <tr key={d} className="border-t border-line">
                    <td className="py-1.5 text-left">{d}</td>
                    {lines.map((l) => {
                      const c = changePct(l.full, i);
                      return (
                        <td key={`${l.kind.kind}-${l.region.id}`}>
                          {l.full[i]?.toFixed(2) ?? "-"} <span className={toneCls(c)}>{signed(c)}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              }).reverse()}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

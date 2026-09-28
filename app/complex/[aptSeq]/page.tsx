import Link from "next/link";
import { notFound } from "next/navigation";
import { Dimmed, FilterScope, OptionList, RailLayout, RangeList } from "../../_components/Filters";
import { DealScatter, Legend, type DealDot } from "../../_components/Charts";
import { Badge, Card, Stat } from "../../_components/ui";
import { formatEok, formatPct } from "@/lib/format";
import { getComplex, getComplexRents, getComplexTrades } from "@/lib/queries";
import { currentYm, rangeLabel, resolveRange } from "@/lib/range";

const TABLE_ROWS = 50;
const ts = (date: string) => Date.parse(`${date}T00:00:00Z`);
const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export default async function ComplexPage({ params, searchParams }: PageProps<"/complex/[aptSeq]">) {
  const { aptSeq: raw } = await params;
  const aptSeq = decodeURIComponent(raw);
  const sp = await searchParams;
  const range = resolveRange(sp);

  const [complex, trades, rents] = await Promise.all([
    getComplex(aptSeq),
    getComplexTrades(aptSeq, range.from, range.to),
    getComplexRents(aptSeq, range.from, range.to),
  ]);
  if (!complex) notFound();

  // 면적 타입: 기간 내 거래 수 많은 순. 기본값은 매매가 가장 많은 타입.
  const counts = new Map<number, number>();
  for (const r of [...trades, ...rents]) counts.set(r.area_type, (counts.get(r.area_type) ?? 0) + 1);
  const tradeCounts = new Map<number, number>();
  for (const r of trades) tradeCounts.set(r.area_type, (tradeCounts.get(r.area_type) ?? 0) + 1);
  const areas = [...counts.keys()].sort((a, b) => a - b);
  const defaultArea = [...tradeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? areas[0];
  const areaParam = typeof sp.area === "string" ? sp.area : undefined;
  const area = areaParam === "all" ? null : areas.find((a) => String(a) === areaParam) ?? defaultArea ?? null;

  const t = trades.filter((r) => area == null || r.area_type === area);
  const rt = rents.filter((r) => area == null || r.area_type === area);
  const validTrades = t.filter((r) => !r.is_cancelled && !r.missing_since);
  const jeonse = rt.filter((r) => r.rent_type === "전세");

  const tradeDots: DealDot[] = validTrades.map((r) => {
    const ev = r.events.find((e) => !e.invalidated_at);
    return {
      t: ts(r.deal_date), price: r.price_man, kind: "매매", date: r.deal_date, floor: r.floor, direct: r.is_direct,
      tag: ev ? `${ev.type === "NEW_HIGH" ? "신고가" : "하락"} ${formatPct(Number(ev.change_pct))}` : undefined,
    };
  });
  const jeonseDots: DealDot[] = jeonse.map((r) => ({
    t: ts(r.deal_date), price: r.deposit_man, kind: "전세", date: r.deal_date, floor: r.floor, direct: false,
    tag: r.contract_type ? `${r.contract_type}${r.use_rr_right ? "(갱신요구권)" : ""}` : undefined,
  }));

  // 요약
  const lastTrade = validTrades[0];
  const maxTrade = validTrades.reduce<number | null>((m, r) => (m == null || r.price_man > m ? r.price_man : m), null);
  const recentCut = new Date();
  recentCut.setMonth(recentCut.getMonth() - 3);
  const recentJeonse = median(jeonse.filter((r) => r.deal_date >= recentCut.toISOString().slice(0, 10)).map((r) => r.deposit_man));
  const recentTrade = median(validTrades.filter((r) => r.deal_date >= recentCut.toISOString().slice(0, 10)).map((r) => r.price_man));

  return (
    <FilterScope>
      <Link href="/complex" className="text-sm text-ink-2 hover:underline">← 단지 목록</Link>
      <h1 className="mt-2 text-xl font-semibold">{complex.apt_nm}</h1>
      <p className="mb-4 text-sm text-ink-2">
        {complex.regions.sigungu_name} {complex.umd_nm} {complex.jibun}
        {complex.road_nm && ` · ${complex.road_nm}`}
        {complex.build_year && ` · ${complex.build_year}년 준공`}
      </p>

      <RailLayout
        summary={[area == null ? "전체 면적" : `${area}㎡`, rangeLabel(range)]}
        rail={
          <>
            <RangeList rangeKey={range.key} from={range.from} to={range.to} max={currentYm()} />
            <OptionList
              label="전용면적 · 기간 내 거래"
              param="area"
              value={area == null ? "all" : String(area)}
              options={[
                ...areas.map((a) => ({ value: String(a), label: `${a}㎡`, aside: `${counts.get(a)}건` })),
                { value: "all", label: "전체" },
              ]}
            />
          </>
        }
      >
      <Dimmed>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="최근 매매" value={formatEok(lastTrade?.price_man)} sub={lastTrade ? `${lastTrade.deal_date} · ${lastTrade.floor ?? "-"}층` : undefined} />
          <Stat label="기간 내 최고가" value={formatEok(maxTrade)} />
          <Stat label="최근 3개월 매매 중위" value={formatEok(recentTrade)} />
          <Stat
            label="최근 3개월 전세 중위"
            value={formatEok(recentJeonse)}
            sub={recentTrade && recentJeonse ? `전세가율 ${Math.round((recentJeonse / recentTrade) * 100)}%` : undefined}
          />
        </div>

        <Card
          title="거래 분포"
          subtitle="점 하나가 거래 한 건. 해제·정정 거래 제외."
          right={<Legend items={[{ color: "var(--series-1)", label: "매매" }, { color: "var(--series-2)", label: "전세" }, { color: "var(--ink-2)", label: "직거래", hollow: true }]} />}
        >
          {tradeDots.length + jeonseDots.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">이 기간에 거래가 없습니다.</p>
          ) : (
            <DealScatter trades={tradeDots} jeonse={jeonseDots} from={range.from} to={range.to} />
          )}
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={`매매 ${t.length}건`} subtitle={t.length > TABLE_ROWS ? `최근 ${TABLE_ROWS}건` : undefined}>
            <table className="mono w-full text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="py-1 text-left font-normal">계약일</th>
                  <th className="font-normal">전용</th>
                  <th className="font-normal">층</th>
                  <th className="font-normal">거래가</th>
                  <th className="text-left font-normal"><span className="pl-3">비고</span></th>
                </tr>
              </thead>
              <tbody>
                {t.slice(0, TABLE_ROWS).map((r) => {
                  const bad = r.is_cancelled || !!r.missing_since;
                  const ev = r.events.find((e) => !e.invalidated_at);
                  return (
                    <tr key={r.id} className={`border-t border-line text-right ${bad ? "text-muted line-through" : ""}`}>
                      <td className="py-1.5 text-left">{r.deal_date}</td>
                      <td>{r.area_type}</td>
                      <td>{r.floor ?? "-"}</td>
                      <td className="font-medium">{formatEok(r.price_man)}</td>
                      <td className="text-left">
                        <span className="inline-flex flex-wrap gap-1 pl-3">
                          {ev && (ev.type === "NEW_HIGH" ? <Badge tone="up">▲ 신고가</Badge> : <Badge tone="down">▼ 하락</Badge>)}
                          {r.is_direct && <Badge>직거래</Badge>}
                          {r.is_cancelled && <Badge>해제</Badge>}
                          {r.missing_since && !r.is_cancelled && <Badge>정정·삭제</Badge>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Card title={`전월세 ${rt.length}건`} subtitle={rt.length > TABLE_ROWS ? `최근 ${TABLE_ROWS}건` : undefined}>
            <table className="mono w-full text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="py-1 text-left font-normal">계약일</th>
                  <th className="font-normal">전용</th>
                  <th className="font-normal">층</th>
                  <th className="font-normal">보증금</th>
                  <th className="font-normal">월세</th>
                  <th className="text-left font-normal"><span className="pl-3">구분</span></th>
                </tr>
              </thead>
              <tbody>
                {rt.slice(0, TABLE_ROWS).map((r) => (
                  <tr key={r.id} className="border-t border-line text-right">
                    <td className="py-1.5 text-left">{r.deal_date}</td>
                    <td>{r.area_type}</td>
                    <td>{r.floor ?? "-"}</td>
                    <td className="font-medium">{formatEok(r.deposit_man)}</td>
                    <td>{r.monthly_rent_man ? `${r.monthly_rent_man}만` : "-"}</td>
                    <td className="text-left">
                      <span className="inline-flex gap-1 pl-3">
                        <Badge>{r.rent_type}</Badge>
                        {r.contract_type && <Badge>{r.contract_type}</Badge>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </Dimmed>
      </RailLayout>
    </FilterScope>
  );
}

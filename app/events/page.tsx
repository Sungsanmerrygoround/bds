import Link from "next/link";
import { Dimmed, FilterBar, FilterScope, ParamSelect, ParamToggle } from "../_components/Filters";
import { Badge } from "../_components/ui";
import { formatEok, formatPct } from "@/lib/format";
import { EVENT_LIMIT, getEvents, getGroups } from "@/lib/queries";

const PERIODS = [
  { value: "1", label: "최근 1개월" },
  { value: "3", label: "최근 3개월" },
  { value: "6", label: "최근 6개월" },
  { value: "12", label: "최근 1년" },
];
const SAMPLES = [
  { value: "1", label: "1건 이상" },
  { value: "3", label: "3건 이상" },
  { value: "10", label: "10건 이상" },
];

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const groups = await getGroups();
  const groupId = groups.find((g) => String(g.id) === str("g"))?.id ?? null;
  const type = str("type") === "NEW_HIGH" || str("type") === "DROP" ? (str("type") as "NEW_HIGH" | "DROP") : null;
  const months = PERIODS.find((p) => p.value === str("m"))?.value ?? "3";
  const minSamples = SAMPLES.find((s) => s.value === str("n"))?.value ?? "1";
  const excludeDirect = str("nodirect") === "1";
  const includeInvalid = str("invalid") === "1";

  const since = new Date();
  since.setMonth(since.getMonth() - Number(months));
  const events = await getEvents({
    type, groupId, minSamples: Number(minSamples), includeDirect: !excludeDirect, includeInvalid,
    since: since.toISOString().slice(0, 10),
  });
  const highs = events.filter((e) => e.type === "NEW_HIGH").length;

  return (
    <FilterScope>
      <h1 className="mb-1 text-2xl font-semibold">신고가·하락 거래</h1>
      <p className="mb-4 text-sm text-ink-2">
        같은 단지·같은 전용면적(소수 첫째 자리) 기준. 신고가 = 계약일 직전 36개월 최고가 초과, 하락 = 직전 6개월 중위가 대비 -10% 이하.
      </p>
      <FilterBar>
        <ParamSelect label="계약일" param="m" value={months} options={PERIODS} />
        <ParamSelect label="유형" param="type" value={type ?? "all"} options={[{ value: "all", label: "전체" }, { value: "NEW_HIGH", label: "신고가" }, { value: "DROP", label: "하락" }]} />
        <ParamSelect label="지역" param="g" value={groupId ? String(groupId) : "all"} options={[{ value: "all", label: "전체" }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
        <ParamSelect label="비교 거래 수" param="n" value={minSamples} options={SAMPLES} />
        <ParamToggle label="직거래 제외" param="nodirect" checked={excludeDirect} />
        <ParamToggle label="해제·정정된 거래 포함" param="invalid" checked={includeInvalid} />
      </FilterBar>

      <Dimmed>
        <p className="mb-2 text-sm text-ink-2">
          {events.length}건 (신고가 {highs} · 하락 {events.length - highs})
          {events.length >= EVENT_LIMIT && <span className="text-muted"> — 최근 {EVENT_LIMIT}건까지만 표시합니다. 조건을 좁혀 보세요.</span>}
        </p>
        <div className="panel overflow-x-auto">
          <table className="mono w-full min-w-[760px] text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="text-right">
                <th className="px-3 py-2 text-left font-normal">계약일</th>
                <th className="px-3 text-left font-normal">유형</th>
                <th className="px-3 text-left font-normal">단지</th>
                <th className="px-3 font-normal">전용</th>
                <th className="px-3 font-normal">층</th>
                <th className="px-3 font-normal">거래가</th>
                <th className="px-3 font-normal">비교가</th>
                <th className="px-3 font-normal">변동</th>
                <th className="px-3 font-normal">비교 거래</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className={`border-t border-line text-right hover:bg-wash ${e.invalidated_at ? "text-muted line-through" : ""}`}>
                  <td className="px-3 py-2 text-left">{e.deal_date}</td>
                  <td className="px-3 text-left">
                    <span className="inline-flex gap-1">
                      {e.type === "NEW_HIGH" ? <Badge tone="up">▲ 신고가</Badge> : <Badge tone="down">▼ 하락</Badge>}
                      {e.is_direct && <Badge>직거래</Badge>}
                    </span>
                  </td>
                  <td className="px-3 text-left font-sans">
                    <Link href={`/complex/${encodeURIComponent(e.apt_seq)}?area=${e.area_type}`} className="font-medium hover:underline">
                      {e.complexes.apt_nm}
                    </Link>
                    <span className="ml-1.5 text-xs text-muted">{e.complexes.regions.sigungu_name} {e.complexes.umd_nm}</span>
                  </td>
                  <td className="px-3">{e.area_type}㎡</td>
                  <td className="px-3">{e.apt_trades?.floor ?? "-"}</td>
                  <td className="px-3 font-medium">{formatEok(e.price_man)}</td>
                  <td className="px-3 text-ink-2">
                    {formatEok(e.ref_price_man)}
                    <span className="ml-1 text-xs text-muted">{e.type === "NEW_HIGH" ? "최고" : "중위"}</span>
                  </td>
                  <td className={`px-3 ${e.type === "NEW_HIGH" ? "text-up" : "text-down"}`}>{formatPct(Number(e.change_pct))}</td>
                  <td className="px-3 text-ink-2">{e.ref_sample_count}건</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={9} className="py-12 text-center text-muted">조건에 맞는 거래가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Dimmed>
    </FilterScope>
  );
}

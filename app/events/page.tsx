import type { Metadata } from "next";
import { EventTabs } from "../_components/EventTabs";
import { Dimmed, FilterBar, FilterScope, ParamSelect, ParamToggle } from "../_components/Filters";
import { Badge, ComplexLink, EmptyRow, PageHeader, Pager } from "../_components/ui";
import { SAMPLE_OPTIONS } from "./options";
import { formatEok, formatPct } from "@/lib/format";
import { findGroup, findOption, groupOptions, groupValue, PAGE_PARAM, pageIndex, withParam } from "@/lib/params";
import { EVENT_PAGE, getEventCounts, getEvents, getGroups, type EventFilter, type EventRow } from "@/lib/queries";
import { addDays, monthsAgo, todayKst } from "@/lib/range";
import { isUnregistered, UNREGISTERED_DAYS } from "@/lib/stats";

const PERIODS = [
  { value: "1", label: "최근 1개월" },
  { value: "3", label: "최근 3개월" },
  { value: "6", label: "최근 6개월" },
  { value: "12", label: "최근 1년" },
];
const TYPES: { value: "all" | EventRow["type"]; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "NEW_HIGH", label: "신고가" },
  { value: "DROP", label: "하락" },
];

export const metadata: Metadata = { title: "신고가·하락" };

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const sp = await searchParams;
  const groups = await getGroups();
  const groupId = findGroup(groups, sp.g)?.id ?? null;
  const typeValue = findOption(TYPES, sp.type)?.value ?? "all";
  const months = findOption(PERIODS, sp.m)?.value ?? "3";
  const minSamples = findOption(SAMPLE_OPTIONS, sp.n)?.value ?? "1";
  const excludeDirect = sp.nodirect === "1";
  const includeInvalid = sp.invalid === "1";

  const filter: EventFilter = {
    type: typeValue === "all" ? null : typeValue, groupId, minSamples: Number(minSamples), includeDirect: !excludeDirect, includeInvalid,
    since: monthsAgo(Number(months)),
  };
  const today = todayKst();
  const counts = await getEventCounts(filter, addDays(today, -UNREGISTERED_DAYS));
  const total = counts.highs + counts.drops;
  const pages = Math.max(1, Math.ceil(total / EVENT_PAGE));
  const page = Math.min(pageIndex(sp[PAGE_PARAM]), pages - 1);
  const events = total === 0 ? [] : await getEvents(filter, page);
  const unreg = (e: EventRow) => !!e.apt_trades && isUnregistered({ deal_date: e.deal_date, ...e.apt_trades }, today);
  const pageHref = (i: number) => withParam("/events", sp, PAGE_PARAM, i === 0 ? null : String(i + 1));

  return (
    <FilterScope>
      <PageHeader title="신고가·하락 거래" gap="mb-3">
        같은 단지·같은 전용면적(소수 첫째 자리) 기준. 신고가 = 계약일 직전 36개월 최고가 초과, 하락 = 직전 6개월 중위가 대비 -10% 이하.
      </PageHeader>
      <EventTabs active="/events" />
      <FilterBar>
        <ParamSelect label="계약일" param="m" value={months} options={PERIODS} />
        <ParamSelect label="유형" param="type" value={typeValue} options={TYPES} />
        <ParamSelect label="지역" param="g" value={groupValue(groupId)} options={groupOptions(groups)} />
        <ParamSelect label="비교 거래 수" param="n" value={minSamples} options={SAMPLE_OPTIONS} />
        <ParamToggle label="직거래 제외" param="nodirect" checked={excludeDirect} />
        <ParamToggle label="해제·정정된 거래 포함" param="invalid" checked={includeInvalid} />
      </FilterBar>

      <Dimmed>
        <p className="mb-2 text-sm text-ink-2">
          {total}건 (신고가 {counts.highs} · 하락 {counts.drops})
          {counts.unreg > 0 && <span className="text-warn"> · 미등기 {counts.unreg}건</span>}
          {counts.unreg > 0 && <span className="text-muted"> (계약 후 {UNREGISTERED_DAYS}일이 지나도 등기 정보 없음 — 잔금이 긴 정상 거래일 수도 있습니다)</span>}
          {pages > 1 && <span className="text-muted"> · {page * EVENT_PAGE + 1}~{page * EVENT_PAGE + events.length}번째</span>}
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
                      {unreg(e) && <Badge tone="warn">미등기</Badge>}
                    </span>
                  </td>
                  <td className="px-3 text-left font-sans">
                    <ComplexLink aptSeq={e.apt_seq} name={e.complexes.apt_nm} where={`${e.complexes.regions.sigungu_name} ${e.complexes.umd_nm ?? ""}`} area={e.area_type} />
                  </td>
                  <td className="px-3">{e.area_type}㎡</td>
                  <td className="px-3">{e.apt_trades?.floor ?? "-"}</td>
                  <td className="px-3 font-medium">{formatEok(e.price_man)}</td>
                  <td className="px-3 text-ink-2">
                    {formatEok(e.ref_price_man)}
                    <span className="ml-1 text-xs text-muted">{e.type === "NEW_HIGH" ? "최고" : "중위"}</span>
                  </td>
                  <td className={`px-3 ${e.type === "NEW_HIGH" ? "text-up" : "text-down"}`}>{formatPct(e.change_pct)}</td>
                  <td className="px-3 text-ink-2">{e.ref_sample_count}건</td>
                </tr>
              ))}
              {events.length === 0 && <EmptyRow cols={9}>조건에 맞는 거래가 없습니다.</EmptyRow>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} hrefOf={pageHref} />
      </Dimmed>
    </FilterScope>
  );
}

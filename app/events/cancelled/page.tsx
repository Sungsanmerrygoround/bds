import type { Metadata } from "next";
import { EventTabs } from "../../_components/EventTabs";
import { Dimmed, FilterBar, FilterScope, ParamSelect, ParamToggle } from "../../_components/Filters";
import { Badge, ComplexLink, EmptyRow, PageHeader, Stat } from "../../_components/ui";
import { SAMPLE_OPTIONS } from "../options";
import { formatEok, formatPct } from "@/lib/format";
import { findGroup, findOption, groupOptions, groupValue } from "@/lib/params";
import { CANCELLED_LIMIT, getCancelledTrades, getGroups, type CancelledTrade } from "@/lib/queries";
import { daysBetween, monthsAgo } from "@/lib/range";
import { median, pctChange } from "@/lib/stats";

// 해제된 거래: 신고가로 신고됐다가 나중에 해제된 거래를 따로 본다 (높은 가격을 찍어 놓고 취소하는 거래를 가려내는 용도).
// 신고가 여부는 계약 당시 기준으로 다시 계산한다: 계약일 직전 36개월, 같은 단지·같은 전용면적 유효 거래의 최고가 초과.

const PERIODS = [
  { value: "3", label: "최근 3개월" },
  { value: "6", label: "최근 6개월" },
  { value: "12", label: "최근 1년" },
  { value: "36", label: "최근 3년" },
  { value: "60", label: "최근 5년" },
];

/** 계약 당시 신고가였나: 직전 36개월 비교 거래가 minSamples건 이상이고 그 최고가를 넘었다 */
const wasHigh = (t: CancelledTrade, minSamples: number) => t.prev_max != null && t.prev_count >= minSamples && t.price_man > t.prev_max;

export const metadata: Metadata = { title: "해제된 거래" };

export default async function CancelledPage({ searchParams }: PageProps<"/events/cancelled">) {
  const sp = await searchParams;
  const groups = await getGroups();
  const groupId = findGroup(groups, sp.g)?.id ?? null;
  const months = findOption(PERIODS, sp.m)?.value ?? "12";
  const minSamples = Number(findOption(SAMPLE_OPTIONS, sp.n)?.value ?? "1");
  const showAll = sp.all === "1";
  const excludeDirect = sp.nodirect === "1";

  const fetched = await getCancelledTrades(groupId, monthsAgo(Number(months)));
  const all = fetched.filter((t) => !excludeDirect || !t.is_direct);
  const highs = all.filter((t) => wasHigh(t, minSamples));
  const rows = showAll ? all : highs;

  const cancelDays = median(highs.map((t) => daysBetween(t.deal_date, t.cancel_date)));
  // 해제 전까지 같은 단지·면적에서 직전 최고가를 넘는 거래가 뒤따른 신고가 해제 (찍어 둔 가격이 시세가 된 경우)
  const followed = highs.filter((t) => t.later_max != null && t.later_max > t.prev_max!).length;

  return (
    <FilterScope>
      <PageHeader title="해제된 거래" gap="mb-3">
        신고된 뒤 계약이 해제된 매매. 신고가 = 계약일 직전 36개월, 같은 단지·같은 전용면적(소수 첫째 자리) 유효 거래의 최고가 초과.
        <span className="text-muted"> 해제 사유(단순 변심, 대출 불가, 재계약 등)는 신고 자료에 없어 알 수 없습니다.</span>
      </PageHeader>
      <EventTabs active="/events/cancelled" />
      <FilterBar>
        <ParamSelect label="해제일" param="m" value={months} options={PERIODS} />
        <ParamSelect label="지역" param="g" value={groupValue(groupId)} options={groupOptions(groups)} />
        <ParamSelect label="비교 거래 수" param="n" value={String(minSamples)} options={SAMPLE_OPTIONS} />
        <ParamToggle label="직거래 제외" param="nodirect" checked={excludeDirect} />
        <ParamToggle label="신고가가 아닌 해제도 표시" param="all" checked={showAll} />
      </FilterBar>

      <Dimmed>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label="해제된 매매" value={String(all.length)} unit="건" />
          <Stat label="그중 계약 당시 신고가" value={String(highs.length)} unit="건"
            sub={all.length ? `해제 거래의 ${((highs.length / all.length) * 100).toFixed(0)}%` : undefined} />
          <Stat label="신고가 해제까지 걸린 기간" value={cancelDays == null ? "-" : String(Math.round(cancelDays))} unit={cancelDays == null ? undefined : "일"} sub="계약일 → 해제일, 중위" />
          <Stat label="해제 전 더 높은 거래가 뒤따름" value={String(followed)} unit="건" sub="같은 단지·면적에서 직전 최고가를 넘는 거래" />
        </div>

        <p className="mb-2 text-sm text-ink-2">
          {rows.length}건{!showAll && " (계약 당시 신고가였던 해제 거래)"}
          {fetched.length >= CANCELLED_LIMIT && <span className="text-muted"> — 최근 해제 {CANCELLED_LIMIT}건 안에서 집계했습니다. 기간이나 지역을 좁혀 보세요.</span>}
        </p>
        <div className="panel overflow-x-auto">
          <table className="mono w-full min-w-[900px] text-[13px]">
            <thead className="text-xs text-muted">
              <tr className="text-right">
                <th className="px-3 py-2 text-left font-normal">해제일</th>
                <th className="px-3 text-left font-normal">계약일</th>
                <th className="px-3 text-left font-normal">단지</th>
                <th className="px-3 font-normal">전용</th>
                <th className="px-3 font-normal">층</th>
                <th className="px-3 font-normal">거래가</th>
                <th className="px-3 font-normal">직전 최고가</th>
                <th className="px-3 font-normal">대비</th>
                <th className="px-3 font-normal" title="계약일 뒤 ~ 해제일까지 같은 단지·같은 면적의 유효 거래">해제 전 후속 거래</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const high = wasHigh(t, minSamples);
                const over = pctChange(t.price_man, t.prev_max);
                return (
                  <tr key={t.id} className="border-t border-line text-right hover:bg-wash">
                    <td className="whitespace-nowrap px-3 py-2 text-left">{t.cancel_date}</td>
                    <td className="whitespace-nowrap px-3 text-left text-ink-2">
                      {t.deal_date}
                      <span className="ml-1.5 text-[11px] text-muted">{daysBetween(t.deal_date, t.cancel_date)}일 뒤 해제</span>
                    </td>
                    <td className="px-3 text-left font-sans">
                      <ComplexLink aptSeq={t.apt_seq} name={t.apt_nm} where={`${t.sigungu_name} ${t.umd_nm ?? ""}`} area={t.area_type} />
                      <span className="ml-1.5 inline-flex gap-1">
                        {high && <Badge tone="up">▲ 신고가였음</Badge>}
                        {t.is_direct && <Badge>직거래</Badge>}
                      </span>
                    </td>
                    <td className="px-3">{t.area_type}㎡</td>
                    <td className="px-3">{t.floor ?? "-"}</td>
                    <td className="px-3 font-medium">{formatEok(t.price_man)}</td>
                    <td className="px-3 text-ink-2">
                      {formatEok(t.prev_max)}
                      {t.prev_count > 0 && <span className="ml-1 text-xs text-muted">{t.prev_count}건</span>}
                    </td>
                    <td className={`px-3 ${over == null ? "" : over > 0 ? "text-up" : "text-down"}`}>{formatPct(over)}</td>
                    <td className="px-3 text-ink-2">
                      {t.later_count === 0 ? "-" : (
                        <>
                          {t.later_count}건 · 최고 <span className={t.prev_max != null && t.later_max! > t.prev_max ? "text-up" : ""}>{formatEok(t.later_max)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <EmptyRow cols={9}>조건에 맞는 해제 거래가 없습니다.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Dimmed>
    </FilterScope>
  );
}

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { FavButton } from "../_components/FavButton";
import { Dimmed, FilterBar, FilterScope, ParamSelect, ParamToggle } from "../_components/Filters";
import { Badge, ComplexLink, Stat, toneText } from "../_components/ui";
import { getFavorites } from "@/lib/favorites";
import { deltaTone, formatEok, formatPct, shortDate } from "@/lib/format";
import { findGroup, groupOptions, groupValue, paramStr } from "@/lib/params";
import { getGroups, getNewRents, getNewTrades, NEW_DEAL_LIMIT, type NewRent, type NewTrade } from "@/lib/queries";
import { addDays, daysBetween, kstDateOf, todayKst } from "@/lib/range";
import { isNewContract, median, pctChange } from "@/lib/stats";

// 새로 신고된 거래: 수집에서 처음 본 날(first_seen_at) 기준.
// 실거래는 계약 후 30일 안에 신고하므로 계약일 순 목록에서는 새 거래가 지난달 사이사이에 끼어 눈에 안 띈다.
// 매일 아침 수집이라 '수집일'은 대체로 신고 다음 날이다.
// 알림 대신 이 화면을 본다: '관심 단지만'(?fav=1)을 켜면 이 브라우저에 ★로 저장한 단지의 새 거래만 나온다.

const PERIODS = [
  { value: "1", label: "오늘 수집분" },
  { value: "3", label: "최근 3일" },
  { value: "7", label: "최근 7일" },
  { value: "14", label: "최근 14일" },
  { value: "30", label: "최근 30일" },
];
const KINDS = [
  { value: "trade", label: "매매" },
  { value: "rent", label: "전월세" },
];
// 이 날 전에 처음 본 행은 과거 5년치를 한꺼번에 받은 것(2026-09-28)이라 '새 신고'가 아니다
const FIRST_SEEN_FLOOR = "2026-09-29";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 (${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;

/** 수집일별로 묶기 (입력은 최근 수집 순) */
function byDay<T extends { first_seen_at: string }>(rows: T[]): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = [];
  for (const r of rows) {
    const day = kstDateOf(r.first_seen_at);
    if (out.at(-1)?.day === day) out.at(-1)!.rows.push(r);
    else out.push({ day, rows: [r] });
  }
  return out;
}

function ComplexCell({ r, fav }: { r: { apt_seq: string; apt_nm: string; umd_nm: string | null; sigungu_name: string; area_type: number }; fav: boolean }) {
  return (
    <td className="px-3 text-left font-sans">
      <span className="flex items-center gap-1">
        <FavButton aptSeq={r.apt_seq} on={fav} name={r.apt_nm} />
        <span className="min-w-0">
          <ComplexLink aptSeq={r.apt_seq} name={r.apt_nm} where={`${r.sigungu_name} ${r.umd_nm ?? ""}`} area={r.area_type} />
        </span>
      </span>
    </td>
  );
}

function DayRows<T extends { id: number; first_seen_at: string }>({ groups, cols, unit, children }: {
  groups: { day: string; rows: T[] }[];
  cols: number;
  unit: string;
  children: (r: T, day: string) => ReactNode;
}) {
  return groups.map((g) => (
    <Fragment key={g.day}>
      <tr className="border-t border-line bg-surface-2 text-left">
        <th colSpan={cols} scope="colgroup" className="px-3 py-1.5 font-sans text-xs font-semibold text-ink-2">
          {dayLabel(g.day)} 수집 <span className="font-normal text-muted">· {unit} {g.rows.length}건</span>
        </th>
      </tr>
      {g.rows.map((r) => children(r, g.day))}
    </Fragment>
  ));
}

export default async function NewDealsPage({ searchParams }: PageProps<"/new">) {
  const sp = await searchParams;
  const str = (k: string) => paramStr(sp[k]);
  const [groups, favs] = await Promise.all([getGroups(), getFavorites()]);
  const groupId = findGroup(groups, sp.g)?.id ?? null;
  const days = PERIODS.find((p) => p.value === str("d"))?.value ?? "3";
  const kind = str("kind") === "rent" ? "rent" : "trade";
  const favOnly = str("fav") === "1";
  const favSet = new Set(favs);
  // 관심 단지만: DB에서 그 단지들로 좁힌다 (전체에서 최근 N건을 받아 거르면 건수 제한에 잘린다). 관심 단지가 없으면 조회하지 않는다.
  const only = favOnly ? favs : undefined;
  const skip = favOnly && favs.length === 0;

  const today = todayKst();
  const wanted = addDays(today, -(Number(days) - 1));
  const sinceDay = wanted > FIRST_SEEN_FLOOR ? wanted : FIRST_SEEN_FLOOR;
  const since = `${sinceDay}T00:00:00+09:00`;
  const [trades, rents] = await Promise.all([
    kind === "trade" && !skip ? getNewTrades(since, groupId, only) : Promise.resolve([] as NewTrade[]),
    kind === "rent" && !skip ? getNewRents(since, groupId, only) : Promise.resolve([] as NewRent[]),
  ]);
  const favCount = (kind === "trade" ? trades : rents).filter((r) => favSet.has(r.apt_seq)).length;
  const empty = skip
    ? <>아직 관심 단지가 없습니다. 이 목록이나 <Link href="/rank" className="underline">순위</Link>·단지 화면에서 ☆를 누르면 여기서 그 단지의 새 거래만 볼 수 있습니다.</>
    : `이 기간에 새로 수집된 ${favOnly ? "관심 단지 " : ""}${kind === "trade" ? "매매가" : "전월세가"} 없습니다.`;
  const count = kind === "trade" ? trades.length : rents.length;

  // 매매 요약: 해제된 채 들어온 거래는 가격 비교에서 뺀다
  const valid = trades.filter((t) => !t.is_cancelled);
  const changes = valid.map((t) => pctChange(t.price_man, t.prev_price)).filter((v): v is number => v != null);
  const ups = changes.filter((v) => v > 0).length;
  const highs = valid.filter((t) => t.event_type === "NEW_HIGH").length;
  const drops = valid.filter((t) => t.event_type === "DROP").length;
  const midChange = median(changes);

  // 전월세 요약
  const jeonse = rents.filter((r) => r.monthly_rent_man === 0);
  const renewals = rents.filter((r) => !isNewContract(r)).length;

  return (
    <FilterScope>
      <h1 className="mb-1 text-2xl font-semibold">새로 신고된 거래</h1>
      <p className="mb-4 text-sm text-ink-2">
        계약일이 아니라 수집에서 처음 잡힌 날 기준입니다. 매일 아침 수집하므로 수집일은 대체로 신고 다음 날입니다.
        <span className="text-muted"> 월요일에는 3~8개월 전 계약을 다시 받으면서 늦게 신고된 옛 거래도 함께 들어옵니다.</span>
      </p>
      <FilterBar>
        <ParamSelect label="종류" param="kind" value={kind} options={KINDS} />
        <ParamSelect label="수집일" param="d" value={days} options={PERIODS} />
        <ParamSelect label="지역" param="g" value={groupValue(groupId)} options={groupOptions(groups)} />
        <ParamToggle label={`★ 관심 단지만 (${favs.length}개)`} param="fav" checked={favOnly} />
      </FilterBar>

      <Dimmed>
        {kind === "trade" ? (
          <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="새 매매" value={String(trades.length)} unit="건" sub={trades.length > valid.length ? `해제 ${trades.length - valid.length}건 포함` : undefined} />
            <Stat label="신고가 / 하락" value={String(highs)} unit={` / ${drops}`} sub="36개월 최고가 초과 / 6개월 중위 −10% 이하" />
            <Stat label="직전 거래보다 오른 거래" value={changes.length ? ((ups / changes.length) * 100).toFixed(0) : "-"} unit={changes.length ? "%" : undefined}
              sub={changes.length ? `비교 가능한 ${changes.length}건 중 ${ups}건` : undefined} />
            <Stat label="직전 거래 대비 중위 변동" value={formatPct(midChange)} sub="같은 단지·같은 전용면적의 바로 앞 계약 대비" />
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="새 전월세" value={String(rents.length)} unit="건" />
            <Stat label="전세 / 월세" value={String(jeonse.length)} unit={` / ${rents.length - jeonse.length}`} />
            <Stat label="갱신 계약" value={String(renewals)} unit="건" sub={rents.length ? `전체의 ${((renewals / rents.length) * 100).toFixed(0)}%` : undefined} />
          </div>
        )}

        {count >= NEW_DEAL_LIMIT && <p className="mb-2 text-sm text-muted">최근 {NEW_DEAL_LIMIT}건까지만 표시합니다. 기간이나 지역을 좁혀 보세요.</p>}
        {!favOnly && favCount > 0 && <p className="mb-2 text-sm text-warn">★ 이 중 관심 단지 거래 {favCount}건</p>}

        <div className="panel overflow-x-auto">
          {kind === "trade" ? (
            <table className="mono w-full min-w-[860px] text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="px-3 py-2 text-left font-normal">계약일</th>
                  <th className="px-3 text-left font-normal">단지</th>
                  <th className="px-3 font-normal">전용</th>
                  <th className="px-3 font-normal">층</th>
                  <th className="px-3 font-normal">거래가</th>
                  <th className="px-3 font-normal">직전 거래</th>
                  <th className="px-3 font-normal">변동</th>
                  <th className="px-3 text-left font-normal">비고</th>
                </tr>
              </thead>
              <tbody>
                <DayRows groups={byDay(trades)} cols={8} unit="매매">
                  {(t, day) => {
                    const chg = pctChange(t.price_man, t.prev_price);
                    const late = daysBetween(t.deal_date, day);
                    return (
                      <tr key={t.id} className={`border-t border-line text-right hover:bg-wash ${t.is_cancelled ? "text-muted line-through" : ""}`}>
                        <td className="whitespace-nowrap px-3 py-2 text-left">
                          {shortDate(t.deal_date)}
                          <span className="ml-1.5 text-[11px] text-muted" title="계약일부터 수집일까지">{late}일</span>
                        </td>
                        <ComplexCell r={t} fav={favSet.has(t.apt_seq)} />
                        <td className="px-3">{t.area_type}㎡</td>
                        <td className="px-3">{t.floor ?? "-"}</td>
                        <td className="px-3 font-medium">{formatEok(t.price_man)}</td>
                        <td className="px-3 text-ink-2">
                          {formatEok(t.prev_price)}
                          {t.prev_date && <span className="ml-1 text-[11px] text-muted">{shortDate(t.prev_date)}</span>}
                        </td>
                        <td className={`px-3 ${toneText[deltaTone(chg)]}`}>{formatPct(chg)}</td>
                        <td className="px-3 text-left">
                          <span className="inline-flex flex-wrap gap-1">
                            {t.event_type === "NEW_HIGH" && <Badge tone="up">▲ 신고가 {formatPct(t.event_pct)}</Badge>}
                            {t.event_type === "DROP" && <Badge tone="down">▼ 하락 {formatPct(t.event_pct)}</Badge>}
                            {t.is_direct && <Badge>직거래</Badge>}
                            {t.is_cancelled && <Badge>해제</Badge>}
                          </span>
                        </td>
                      </tr>
                    );
                  }}
                </DayRows>
                {trades.length === 0 && <tr><td colSpan={8} className="py-12 text-center font-sans text-muted">{empty}</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="mono w-full min-w-[860px] text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="px-3 py-2 text-left font-normal">계약일</th>
                  <th className="px-3 text-left font-normal">단지</th>
                  <th className="px-3 font-normal">전용</th>
                  <th className="px-3 font-normal">층</th>
                  <th className="px-3 font-normal">보증금</th>
                  <th className="px-3 font-normal">월세</th>
                  <th className="px-3 font-normal">종전 보증금</th>
                  <th className="px-3 text-left font-normal">구분</th>
                </tr>
              </thead>
              <tbody>
                <DayRows groups={byDay(rents)} cols={8} unit="전월세">
                  {(r) => {
                    // 보증금 변동은 전세→전세 갱신만 (월세가 끼면 보증금만으로 비교할 수 없다)
                    const chg = r.monthly_rent_man === 0 && !r.pre_monthly_rent_man ? pctChange(r.deposit_man, r.pre_deposit_man) : null;
                    return (
                      <tr key={r.id} className="border-t border-line text-right hover:bg-wash">
                        <td className="px-3 py-2 text-left">{shortDate(r.deal_date)}</td>
                        <ComplexCell r={r} fav={favSet.has(r.apt_seq)} />
                        <td className="px-3">{r.area_type}㎡</td>
                        <td className="px-3">{r.floor ?? "-"}</td>
                        <td className="px-3 font-medium">{formatEok(r.deposit_man)}</td>
                        <td className="px-3">{r.monthly_rent_man ? `${r.monthly_rent_man}만` : "-"}</td>
                        <td className="px-3 text-ink-2">
                          {r.pre_deposit_man == null ? "-" : formatEok(r.pre_deposit_man)}
                          {r.pre_monthly_rent_man ? <span className="ml-1 text-[11px] text-muted">월 {r.pre_monthly_rent_man}만</span> : null}
                          {chg != null && <span className={`ml-1.5 ${toneText[deltaTone(chg)]}`}>{formatPct(chg)}</span>}
                        </td>
                        <td className="px-3 text-left">
                          <span className="inline-flex flex-wrap gap-1">
                            <Badge>{r.monthly_rent_man ? "월세" : "전세"}</Badge>
                            {r.contract_type && <Badge>{r.contract_type}</Badge>}
                            {r.use_rr_right && <Badge>갱신요구권</Badge>}
                          </span>
                        </td>
                      </tr>
                    );
                  }}
                </DayRows>
                {rents.length === 0 && <tr><td colSpan={8} className="py-12 text-center font-sans text-muted">{empty}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </Dimmed>
    </FilterScope>
  );
}

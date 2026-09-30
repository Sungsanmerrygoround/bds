import Link from "next/link";
import { FavButton } from "../_components/FavButton";
import { Badge } from "../_components/ui";
import { getFavorites } from "@/lib/favorites";
import { formatEok, formatPct } from "@/lib/format";
import { getComplexStats, type ComplexStats } from "@/lib/queries";

// 관심 단지: 이 브라우저에 저장한 단지들의 최근 흐름을 한 화면에.
// 단지마다 최근 2년 매매가 가장 많은 전용면적 하나를 기준으로 요약한다.

const COMPARE_MAX = 5;

function derive(s: ComplexStats) {
  const current = s.trade_median_6m ?? s.last_price;
  return {
    current,
    ratio: s.trade_median_6m && s.jeonse_median_6m ? (s.jeonse_median_6m / s.trade_median_6m) * 100 : null,
    peakRatio: current && s.peak_price ? (current / s.peak_price) * 100 : null,
  };
}

function EventBadge({ s }: { s: ComplexStats }) {
  if (!s.event_type) return null;
  return (
    <span title={`${s.event_date} 거래`}>
      {s.event_type === "NEW_HIGH"
        ? <Badge tone="up">▲ 신고가 {formatPct(Number(s.event_pct))}</Badge>
        : <Badge tone="down">▼ 하락 {formatPct(Number(s.event_pct))}</Badge>}
      <span className="ml-1 text-[11px] text-muted">{s.event_date?.slice(2).replace(/-/g, ".")}</span>
    </span>
  );
}

export default async function WatchPage() {
  const favs = await getFavorites();
  const stats = await getComplexStats(favs);
  const order = new Map(favs.map((s, i) => [s, i]));
  const rows = stats.sort((a, b) => order.get(a.apt_seq)! - order.get(b.apt_seq)!);
  const compareHref = `/complex/compare?ids=${rows.slice(0, COMPARE_MAX).map((r) => encodeURIComponent(r.apt_seq)).join(",")}`;
  const href = (s: ComplexStats) => `/complex/${encodeURIComponent(s.apt_seq)}${s.area_type ? `?area=${s.area_type}` : ""}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">관심 단지</h1>
          <p className="mt-1 text-sm text-ink-2">
            ★로 저장한 단지 {rows.length}개. 이 브라우저에만 저장됩니다.
            <span className="text-muted"> 단지마다 최근 2년 매매가 가장 많은 면적 기준, 중위가는 최근 6개월.</span>
          </p>
        </div>
        {rows.length >= 2 && (
          <Link href={compareHref} className="flex min-h-10 items-center rounded bg-s1 px-4 text-sm font-semibold text-page">
            {rows.length > COMPARE_MAX ? `앞의 ${COMPARE_MAX}개 비교하기` : "추이 비교하기"}
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="panel px-6 py-14 text-center text-sm text-ink-2">
          <p>아직 관심 단지가 없습니다.</p>
          <p className="mt-1 text-muted">단지 화면이나 순위표에서 ☆를 누르면 여기에 모입니다.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/rank" className="rounded border border-line px-3 py-2 hover:bg-wash">단지 순위 보기</Link>
            <Link href="/complex" className="rounded border border-line px-3 py-2 hover:bg-wash">단지 검색</Link>
          </div>
        </div>
      ) : (
        <>
          {/* 좁은 화면: 카드 */}
          <div className="flex flex-col gap-3 sm:hidden">
            {rows.map((s) => {
              const d = derive(s);
              return (
                <section key={s.apt_seq} className="panel px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={href(s)} className="font-semibold hover:underline">{s.apt_nm}</Link>
                      <div className="text-xs text-muted">{s.sigungu_name} {s.umd_nm} · {s.build_year ?? "-"}년 · {s.area_type ?? "-"}㎡</div>
                    </div>
                    <FavButton aptSeq={s.apt_seq} on name={s.apt_nm} size="lg" />
                  </div>
                  <dl className="mono mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div><dt className="cap">매매 중위</dt><dd className="text-[15px] font-semibold">{formatEok(s.trade_median_6m)}</dd></div>
                    <div><dt className="cap">전세 중위</dt><dd className="text-[15px] font-semibold">{formatEok(s.jeonse_median_6m)}</dd></div>
                    <div><dt className="cap">최고가 대비</dt><dd className="text-[15px] font-semibold">{d.peakRatio == null ? "-" : `${d.peakRatio.toFixed(0)}%`}</dd></div>
                  </dl>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                    <span className="mono">최근 {s.last_date ?? "-"} {formatEok(s.last_price)}</span>
                    <EventBadge s={s} />
                  </div>
                </section>
              );
            })}
          </div>

          {/* 넓은 화면: 표 */}
          <div className="panel hidden overflow-x-auto sm:block">
            <table className="mono w-full min-w-[900px] text-[13px]">
              <thead className="text-xs text-muted">
                <tr className="text-right">
                  <th className="px-3 py-2 text-left font-normal">단지</th>
                  <th className="px-2 font-normal">기준 면적</th>
                  <th className="px-2 font-normal">최근 거래</th>
                  <th className="px-2 font-normal">매매 중위</th>
                  <th className="px-2 font-normal">전세 중위</th>
                  <th className="px-2 font-normal">전세가율</th>
                  <th className="px-2 font-normal">최고가 대비</th>
                  <th className="px-3 text-left font-normal">최근 신고가·하락</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const d = derive(s);
                  return (
                    <tr key={s.apt_seq} className="border-t border-line text-right hover:bg-wash">
                      <td className="px-3 py-2 text-left font-sans">
                        <span className="flex items-center gap-1">
                          <FavButton aptSeq={s.apt_seq} on name={s.apt_nm} />
                          <span>
                            <Link href={href(s)} className="font-medium hover:underline">{s.apt_nm}</Link>
                            <span className="ml-1.5 text-xs text-muted">{s.sigungu_name} {s.umd_nm} · {s.build_year ?? "-"}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-2">{s.area_type ?? "-"}㎡</td>
                      <td className="px-2">
                        <div className="font-medium">{formatEok(s.last_price)}</div>
                        <div className="text-[11px] text-muted">{s.last_date ?? "-"}</div>
                      </td>
                      <td className="px-2">{formatEok(s.trade_median_6m)}<span className="ml-1 text-[11px] text-muted">{s.trade_count_6m ?? 0}건</span></td>
                      <td className="px-2">{formatEok(s.jeonse_median_6m)}<span className="ml-1 text-[11px] text-muted">{s.jeonse_count_6m ?? 0}건</span></td>
                      <td className="px-2">{d.ratio == null ? "-" : `${d.ratio.toFixed(0)}%`}</td>
                      <td className="px-2" title={s.peak_price ? `최고가 ${formatEok(s.peak_price)} (${s.peak_date})` : undefined}>
                        <div>{d.peakRatio == null ? "-" : `${d.peakRatio.toFixed(0)}%`}</div>
                        {s.peak_price && <div className="text-[11px] text-muted">{formatEok(s.peak_price)} · {s.peak_date?.slice(2, 7).replace("-", ".")}</div>}
                      </td>
                      <td className="px-3 text-left"><EventBadge s={s} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

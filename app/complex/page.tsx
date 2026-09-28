import Link from "next/link";
import { getGroups, searchComplexes } from "@/lib/queries";

export default async function ComplexSearchPage({ searchParams }: PageProps<"/complex">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const groups = await getGroups();
  const groupId = groups.find((g) => String(g.id) === sp.g)?.id ?? null;
  const rows = await searchComplexes(q, groupId);
  const input = "min-h-10 rounded border border-line bg-surface-2 px-2.5 text-sm text-ink";

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">단지</h1>
      <form className="panel mb-4 flex flex-wrap items-end gap-3 px-4 py-3" action="/complex">
        <label className="block">
          <span className="cap mb-1 block">단지명</span>
          <input name="q" defaultValue={q} placeholder="예: 헬리오시티" className={`${input} w-56`} />
        </label>
        <label className="block">
          <span className="cap mb-1 block">지역</span>
          <select name="g" defaultValue={groupId ? String(groupId) : ""} className={input}>
            <option value="">전체</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <button className="min-h-10 rounded bg-s1 px-4 text-sm font-semibold text-page">검색</button>
      </form>

      <p className="mb-2 text-sm text-ink-2">
        {q ? `'${q}' 검색 결과` : "최근 12개월 매매가 많은 순"} {rows.length}개{rows.length >= 100 && " (상위 100개)"}
      </p>
      <div className="panel overflow-x-auto">
        <table className="mono w-full min-w-[560px] text-[13px]">
          <thead className="text-xs text-muted">
            <tr className="text-right">
              <th className="px-3 py-2 text-left font-normal">단지</th>
              <th className="px-3 text-left font-normal">위치</th>
              <th className="px-3 font-normal">준공</th>
              <th className="px-3 font-normal">최근 12개월 매매</th>
              <th className="px-3 font-normal">마지막 거래</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.apt_seq} className="border-t border-line text-right hover:bg-wash">
                <td className="px-3 py-2 text-left font-sans">
                  <Link href={`/complex/${encodeURIComponent(r.apt_seq)}`} className="font-medium hover:underline">{r.apt_nm}</Link>
                </td>
                <td className="px-3 text-left font-sans text-ink-2">{r.sigungu_name} {r.umd_nm}</td>
                <td className="px-3">{r.build_year ?? "-"}</td>
                <td className="px-3">{r.trades_12m}건</td>
                <td className="px-3 text-ink-2">{r.last_deal_date ?? "-"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="py-12 text-center text-muted">검색 결과가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { formatEok, shortYm } from "@/lib/format";
import type { PeakInfo } from "@/lib/stats";

// 전고점 대비: 월별 중위가 3개월 이동평균 기준 (보관 기간 안의 고점).

export interface PeakRow {
  key: string;
  label: string;
  color: string;
  peak: PeakInfo | null;
}

export function PeakTable({ title, rows, note }: { title: string; rows: PeakRow[]; note: string }) {
  return (
    <section className="panel px-4 pb-3 pt-3.5" aria-label={title}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-muted">{note}</span>
      </div>
      <div className="flex flex-col">
        {rows.map((r) => {
          const p = r.peak;
          const gap = p ? p.ratio - 100 : null;
          return (
            <div key={r.key} className="grid grid-cols-[minmax(4.5rem,auto)_1fr_auto] items-center gap-x-3 gap-y-0.5 border-t border-line py-2 first:border-t-0 sm:grid-cols-[8rem_1fr_16rem]">
              <span className="flex items-center gap-2 text-sm">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: r.color }} />
                {r.label}
              </span>
              <span className="relative h-2 overflow-hidden rounded-full bg-tag" aria-hidden="true">
                {p && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, p.ratio)}%`, background: r.color }} />}
              </span>
              <span className="mono text-right text-sm">
                {p ? (
                  <>
                    <span className="font-semibold">{p.ratio.toFixed(1)}%</span>{" "}
                    <span className={gap! >= -0.05 ? "text-up" : "text-down"}>{gap! >= -0.05 ? "고점" : `${gap!.toFixed(1)}%`}</span>
                  </>
                ) : "-"}
              </span>
              {p && (
                <span className="mono col-span-3 text-[11px] text-muted sm:col-span-2 sm:col-start-2">
                  고점 {shortYm(p.peakYm)} {formatEok(p.peak)} → {shortYm(p.nowYm)} {formatEok(p.now)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { RANGE_PRESETS } from "@/lib/range";

// 필터는 URL 검색 파라미터로 상태를 들고, 바뀌면 서버 컴포넌트가 다시 렌더된다.
// 다시 불러오는 동안 기존 화면은 흐리게 유지(레이아웃 점프 없음).

type Updates = Record<string, string | null>;
const Ctx = createContext<{ pending: boolean; setParams: (u: Updates) => void } | null>(null);

function useFilters() {
  const c = useContext(Ctx);
  if (!c) throw new Error("FilterScope 밖에서 사용됨");
  return c;
}

export function FilterScope({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const setParams = (u: Updates) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(u)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return <Ctx.Provider value={{ pending, setParams }}>{children}</Ctx.Provider>;
}

export function Dimmed({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { pending } = useFilters();
  return (
    <div aria-busy={pending} className={`transition-opacity ${pending ? "opacity-50" : ""} ${className}`}>
      {children}
    </div>
  );
}

// ---------- 왼쪽 레일 (추이·단지 상세) ----------

/** 왼쪽 필터 레일 + 본문. 좁은 화면에서는 레일이 위로 올라가고 목록이 가로로 흐른다. */
export function RailLayout({ rail, children }: { rail: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      <aside className="panel flex shrink-0 flex-col gap-5 px-3 py-4 lg:w-[232px]">{rail}</aside>
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

const optCls = (on: boolean) =>
  `flex min-h-10 items-center justify-between gap-3 rounded px-2.5 text-left text-sm ${
    on ? "bg-surface-2 text-ink shadow-[inset_2px_0_0_var(--series-1)]" : "text-ink-2 hover:bg-wash"
  }`;

export function OptionList({
  label, param, value, options, reset,
}: {
  label: string;
  param: string;
  value: string;
  options: { value: string; label: string; aside?: string }[];
  /** 이 값을 고르면 함께 지울 파라미터 */
  reset?: string[];
}) {
  const { setParams } = useFilters();
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-0.5">
      <div className="cap px-2.5 pb-1.5">{label}</div>
      <div className="flex flex-row flex-wrap gap-0.5 lg:flex-col">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            className={optCls(o.value === value)}
            onClick={() => setParams({ [param]: o.value, ...Object.fromEntries((reset ?? []).map((k) => [k, null])) })}
          >
            {o.label}
            {o.aside && <span className="mono text-[11px] text-muted">{o.aside}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

const ymToInput = (ym: string) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
const inputToYm = (v: string) => v.replace("-", "");
const shortYm = (ym: string) => `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;

/** 기간: 프리셋 목록 + 직접 지정(월 단위) */
export function RangeList({ rangeKey, from, to, max }: { rangeKey: string; from: string; to: string; max: string }) {
  const { setParams } = useFilters();
  const [custom, setCustom] = useState(rangeKey === "custom");
  const [f, setF] = useState(ymToInput(from));
  const [t, setT] = useState(ymToInput(to));
  const span = `${shortYm(from)}–${shortYm(to)}`;

  return (
    <div role="group" aria-label="기간" className="flex flex-col gap-0.5">
      <div className="cap px-2.5 pb-1.5">기간</div>
      <div className="flex flex-row flex-wrap gap-0.5 lg:flex-col">
        {RANGE_PRESETS.map((p) => {
          const on = !custom && rangeKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              className={optCls(on)}
              onClick={() => {
                setCustom(false);
                setParams({ range: p.key, from: null, to: null });
              }}
            >
              {p.label}
              {on && <span className="mono hidden text-[11px] text-muted lg:inline">{span}</span>}
            </button>
          );
        })}
        <button type="button" aria-pressed={custom} className={optCls(custom)} onClick={() => setCustom(true)}>
          직접 지정
          {custom && rangeKey === "custom" && <span className="mono hidden text-[11px] text-muted lg:inline">{span}</span>}
        </button>
      </div>
      {custom && (
        <form
          className="mt-2 flex flex-col gap-2 px-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (f && t && f <= t) setParams({ range: null, from: inputToYm(f), to: inputToYm(t) });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            시작 월
            <input type="month" value={f} max={ymToInput(max)} onChange={(e) => setF(e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            끝 월
            <input type="month" value={t} max={ymToInput(max)} onChange={(e) => setT(e.target.value)} className={inputCls} />
          </label>
          <button type="submit" disabled={!f || !t || f > t} className="min-h-10 rounded bg-s1 text-sm font-semibold text-page disabled:opacity-40">
            적용
          </button>
        </form>
      )}
    </div>
  );
}

// ---------- 가로 필터 바 (신고가·하락, 입주 물량) ----------

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="panel mb-4 flex flex-wrap items-end gap-x-5 gap-y-3 px-4 py-3">{children}</div>;
}

export function ParamSelect({
  label, param, value, options,
}: { label: string; param: string; value: string; options: { value: string; label: string }[] }) {
  const { setParams } = useFilters();
  return (
    <label className="block">
      <span className="cap mb-1 block">{label}</span>
      <select value={value} onChange={(e) => setParams({ [param]: e.target.value })} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function ParamToggle({ label, param, checked }: { label: string; param: string; checked: boolean }) {
  const { setParams } = useFilters();
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setParams({ [param]: e.target.checked ? "1" : null })}
        className="h-4 w-4 accent-[var(--series-1)]"
      />
      {label}
    </label>
  );
}

export const inputCls = "min-h-10 rounded border border-line bg-surface-2 px-2.5 text-sm text-ink";

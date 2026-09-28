"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { shortYm } from "@/lib/format";
import { RANGE_PRESETS } from "@/lib/range";

// 필터는 URL 검색 파라미터로 상태를 들고, 바뀌면 서버 컴포넌트가 다시 렌더된다.
// 다시 불러오는 동안 기존 화면은 흐리게 유지(레이아웃 점프 없음).
//
// 서버 응답을 기다리는 동안:
// - 컨트롤은 누른 값을 바로 보여 준다(낙관적 표시).
// - 연달아 바꾼 값은 누적한다. 두 번째 변경을 아직 바뀌지 않은 URL 기준으로 만들면 첫 변경이 사라진다.

type Updates = Record<string, string | null>;
interface Pending {
  at: string; // 변경을 시작할 때의 URL 쿼리. URL이 바뀌면(응답 도착) 무효
  qs: string; // 누적된 목표 쿼리
  touched: Updates; // 누적된 변경값
}
const Ctx = createContext<{
  pending: boolean;
  setParams: (u: Updates) => void;
  /** 대기 중인 변경이 있으면 그 값, 아니면 fallback */
  valueOf: (key: string, fallback: string | null) => string | null;
} | null>(null);

function useFilters() {
  const c = useContext(Ctx);
  if (!c) throw new Error("FilterScope 밖에서 사용됨");
  return c;
}

export function FilterScope({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const spKey = sp.toString();
  const [isPending, start] = useTransition();
  const [queued, setQueued] = useState<Pending | null>(null);
  const live = queued && queued.at === spKey ? queued : null;

  const setParams = (u: Updates) => {
    const next = new URLSearchParams(live ? live.qs : spKey);
    for (const [k, v] of Object.entries(u)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    setQueued({ at: spKey, qs, touched: { ...(live?.touched ?? {}), ...u } });
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  const valueOf = (key: string, fallback: string | null) => (live && key in live.touched ? live.touched[key] : fallback);

  return <Ctx.Provider value={{ pending: isPending, setParams, valueOf }}>{children}</Ctx.Provider>;
}

export function Dimmed({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { pending } = useFilters();
  return (
    <div aria-busy={pending} className={`transition-opacity ${pending ? "opacity-50" : ""} ${className}`}>
      {children}
    </div>
  );
}

// ---------- 필터 레일 (추이·지역 비교·단지 상세) ----------

/**
 * 넓은 화면(lg~): 왼쪽 필터 레일 + 본문.
 * 좁은 화면: 현재 선택을 요약한 칩 한 줄 → 누르면 같은 레일이 바텀시트로 열린다.
 * 레일은 한 번만 렌더하고 CSS로 위치만 바꾼다. 선택은 바로 적용되고 시트는 '완료'로 닫는다.
 */
export function RailLayout({ rail, summary, children }: { rail: ReactNode; summary: string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
      <div className="-mx-4 -mt-1 flex items-center gap-2 overflow-x-auto border-b border-line px-3 pb-3 sm:-mx-6 sm:px-5 lg:hidden">
        {summary.map((s) => (
          <button key={s} type="button" onClick={() => setOpen(true)} className={chipCls}>
            {s} <span className="text-[10px] text-muted" aria-hidden="true">▼</span>
          </button>
        ))}
        <button type="button" onClick={() => setOpen(true)} aria-label="보기 설정 열기" className={`${chipCls} ml-auto w-11 shrink-0 justify-center !px-0`}>
          <svg width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 5 H15 M3 9 H15 M3 13 H15" />
            <circle cx="6" cy="5" r="1.8" fill="var(--surface)" />
            <circle cx="12" cy="9" r="1.8" fill="var(--surface)" />
            <circle cx="8" cy="13" r="1.8" fill="var(--surface)" />
          </svg>
        </button>
      </div>

      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label="보기 설정"
        className={`${open ? "flex" : "hidden"} fixed inset-x-0 bottom-0 z-50 max-h-[85vh] flex-col gap-5 overflow-y-auto rounded-t-2xl border-t border-line bg-surface px-4 pt-2
          lg:static lg:z-auto lg:flex lg:max-h-none lg:w-[232px] lg:shrink-0 lg:self-start lg:overflow-visible lg:rounded-md lg:border lg:px-3 lg:py-4`}
      >
        <div className="flex flex-col lg:hidden">
          <span className="mx-auto mb-1 h-1 w-9 rounded-full bg-tag" aria-hidden="true" />
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">보기 설정</h2>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="닫기" className="flex h-11 w-11 items-center justify-center text-ink-2">
              <svg width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 3 L13 13 M13 3 L3 13" /></svg>
            </button>
          </div>
        </div>
        {rail}
        <div className="sticky bottom-0 -mx-4 border-t border-line bg-surface px-4 pb-6 pt-3 lg:hidden">
          <button type="button" onClick={() => setOpen(false)} className="min-h-12 w-full rounded-lg bg-s1 text-[15px] font-bold text-page">
            완료
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
    </div>
  );
}

const chipCls = "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-sm text-ink";

/** 모바일(시트 안)에서의 열 수 */
const COLS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" } as const;

const optCls = (on: boolean) =>
  `flex min-h-11 items-center justify-between gap-2 rounded border px-2.5 text-left text-sm lg:min-h-10 lg:border-0 ${
    on
      ? "border-s1 bg-surface-2 text-ink lg:shadow-[inset_2px_0_0_var(--series-1)]"
      : "border-line text-ink-2 hover:bg-wash"
  }`;

function OptionGrid({ label, cols, children }: { label: string; cols: keyof typeof COLS; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-0.5">
      <div className="cap pb-1.5 lg:px-2.5">{label}</div>
      <div className={`grid gap-1.5 ${COLS[cols]} lg:flex lg:flex-col lg:gap-0.5`}>{children}</div>
    </div>
  );
}

export function OptionList({ label, param, value, options, cols = 3 }: {
  label: string;
  param: string;
  value: string;
  options: { value: string; label: string; aside?: string }[];
  cols?: keyof typeof COLS;
}) {
  const { setParams, valueOf } = useFilters();
  const current = valueOf(param, value);
  return (
    <OptionGrid label={label} cols={cols}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === current}
          className={optCls(o.value === current)}
          onClick={() => setParams({ [param]: o.value })}
        >
          {o.label}
          {/* 시트의 좁은 격자(3열 이상)에서는 부가 설명을 숨긴다 */}
          {o.aside && <span className={`mono text-[11px] text-muted ${cols >= 3 ? "hidden lg:inline" : ""}`}>{o.aside}</span>}
        </button>
      ))}
    </OptionGrid>
  );
}

const ymToInput = (ym: string) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
const inputToYm = (v: string) => v.replace("-", "");

/** 기간: 프리셋 목록 + 직접 지정(월 단위) */
export function RangeList({ rangeKey, from, to, max }: { rangeKey: string; from: string; to: string; max: string }) {
  const { setParams, valueOf } = useFilters();
  const [custom, setCustom] = useState(rangeKey === "custom");
  const activeKey = valueOf("from", null) ? "custom" : (valueOf("range", rangeKey) ?? rangeKey);
  const [f, setF] = useState(ymToInput(from));
  const [t, setT] = useState(ymToInput(to));
  const span = `${shortYm(from)}–${shortYm(to)}`;

  return (
    <div className="flex flex-col">
      <OptionGrid label="기간" cols={3}>
        {RANGE_PRESETS.map((p) => {
          const on = !custom && activeKey === p.key;
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
          {custom && activeKey === "custom" && <span className="mono hidden text-[11px] text-muted lg:inline">{span}</span>}
        </button>
      </OptionGrid>
      {custom && (
        <form
          className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1 lg:px-2.5"
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
          <button type="submit" disabled={!f || !t || f > t} className="col-span-2 min-h-10 rounded bg-s1 text-sm font-semibold text-page disabled:opacity-40 lg:col-span-1">
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

export function ParamSelect({ label, param, value, options }: {
  label: string;
  param: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  const { setParams, valueOf } = useFilters();
  return (
    <label className="block">
      <span className="cap mb-1 block">{label}</span>
      <select value={valueOf(param, value) ?? value} onChange={(e) => setParams({ [param]: e.target.value })} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function ParamToggle({ label, param, checked }: { label: string; param: string; checked: boolean }) {
  const { setParams, valueOf } = useFilters();
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
      <input
        type="checkbox"
        checked={valueOf(param, checked ? "1" : null) === "1"}
        onChange={(e) => setParams({ [param]: e.target.checked ? "1" : null })}
        className="h-4 w-4 accent-[var(--series-1)]"
      />
      {label}
    </label>
  );
}

export const inputCls = "min-h-10 rounded border border-line bg-surface-2 px-2.5 text-sm text-ink";

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

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">{children}</div>;
}

export function Dimmed({ children }: { children: ReactNode }) {
  const { pending } = useFilters();
  return (
    <div aria-busy={pending} className={`transition-opacity ${pending ? "opacity-50" : ""}`}>
      {children}
    </div>
  );
}

const ymToInput = (ym: string) => `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;
const inputToYm = (v: string) => v.replace("-", "");

/** 기간: 프리셋 + 직접 지정(월 단위) */
export function RangePicker({ rangeKey, from, to, max }: { rangeKey: string; from: string; to: string; max: string }) {
  const { setParams } = useFilters();
  const [custom, setCustom] = useState(rangeKey === "custom");
  const [f, setF] = useState(ymToInput(from));
  const [t, setT] = useState(ymToInput(to));
  const btn = (active: boolean) =>
    `px-3 py-1.5 text-sm ${active ? "bg-ink text-page font-semibold" : "text-ink-2 hover:bg-wash"}`;

  return (
    <div>
      <Label>기간</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-line bg-surface" role="group">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={!custom && rangeKey === p.key}
              className={btn(!custom && rangeKey === p.key)}
              onClick={() => {
                setCustom(false);
                setParams({ range: p.key, from: null, to: null });
              }}
            >
              {p.label}
            </button>
          ))}
          <button type="button" aria-pressed={custom} className={btn(custom)} onClick={() => setCustom(true)}>
            직접
          </button>
        </div>
        {custom && (
          <form
            className="flex items-center gap-1.5 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (f && t && f <= t) setParams({ range: null, from: inputToYm(f), to: inputToYm(t) });
            }}
          >
            <input type="month" value={f} max={ymToInput(max)} onChange={(e) => setF(e.target.value)} className={inputCls} aria-label="시작 월" />
            <span className="text-muted">~</span>
            <input type="month" value={t} max={ymToInput(max)} onChange={(e) => setT(e.target.value)} className={inputCls} aria-label="끝 월" />
            <button type="submit" disabled={!f || !t || f > t} className="rounded-md bg-ink px-3 py-1.5 text-page disabled:opacity-40">
              적용
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ParamSelect({
  label, param, value, options,
}: { label: string; param: string; value: string; options: { value: string; label: string }[] }) {
  const { setParams } = useFilters();
  return (
    <label className="block">
      <Label>{label}</Label>
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
    <label className="flex items-center gap-2 py-1.5 text-sm text-ink-2">
      <input type="checkbox" checked={checked} onChange={(e) => setParams({ [param]: e.target.checked ? "1" : null })} />
      {label}
    </label>
  );
}

const inputCls = "rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink";

function Label({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-xs text-muted">{children}</span>;
}

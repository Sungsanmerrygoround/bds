"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFavorite } from "../actions";

/** 관심 단지 별표. 누르면 바로 채워지고(낙관적), 서버가 쿠키를 저장한 뒤 화면을 다시 그린다. */
export function FavButton({ aptSeq, on, name, size = "sm" }: { aptSeq: string; on: boolean; name: string; size?: "sm" | "lg" }) {
  const [optimistic, setOptimistic] = useOptimistic(on);
  const [, start] = useTransition();
  const box = size === "lg" ? "h-11 w-11" : "h-9 w-9 -my-1.5";
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `${name} 관심 해제` : `${name} 관심 단지에 추가`}
      title={optimistic ? "관심 해제" : "관심 단지에 추가"}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await toggleFavorite(aptSeq, !optimistic);
        })
      }
      className={`inline-flex shrink-0 items-center justify-center rounded ${box} ${optimistic ? "text-warn" : "text-muted hover:text-ink-2"}`}
    >
      <svg width={size === "lg" ? 20 : 16} height={size === "lg" ? 20 : 16} viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 1.6 L9.9 5.6 L14.2 6.1 L11 9.1 L11.9 13.4 L8 11.2 L4.1 13.4 L5 9.1 L1.8 6.1 L6.1 5.6 Z"
          fill={optimistic ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

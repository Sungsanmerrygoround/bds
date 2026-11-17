// 여러 화면이 같이 쓰는 입력칸·버튼 모양.
// "use client" 파일(Filters 등)에서 내보낸 문자열은 서버 컴포넌트에서 문자열로 쓸 수 없어(클라이언트 참조가 된다) 따로 둔다.

export const inputCls = "min-h-10 rounded border border-line bg-surface-2 px-2.5 text-sm text-ink";

/** 테두리만 있는 링크 버튼 (단지 비교 등) */
export const outlineLinkCls = "flex min-h-10 items-center rounded border border-line px-3 text-sm text-ink-2 hover:bg-wash";

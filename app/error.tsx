"use client";

// 화면 조회 중 오류(예: DB가 늦어 시간 초과)가 나면 머리글·메뉴는 그대로 두고 이 안내를 보여 준다.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <div className="panel mx-auto mt-10 max-w-lg px-6 py-8 text-center">
      <h1 className="mb-2 text-xl font-semibold">화면을 불러오지 못했습니다</h1>
      <p className="mb-5 text-sm text-ink-2">
        데이터베이스 응답이 늦거나 잠시 연결이 끊긴 것일 수 있습니다. 다시 시도해 보세요.
      </p>
      <button type="button" onClick={() => retry()} className="min-h-10 rounded border border-line px-4 text-sm text-ink hover:bg-wash">
        다시 시도
      </button>
      {digest && <p className="mono mt-4 text-xs text-muted">오류 코드 {digest}</p>}
    </div>
  );
}

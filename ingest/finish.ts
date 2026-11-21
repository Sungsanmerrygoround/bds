// 수집 실행 앞뒤 정리: 중단된 기록 닫기, 끝난 뒤 대시보드 조회 캐시 비우기
import { check, type Db } from "./db";

/** 이 시간보다 오래 running인 기록은 프로세스가 죽은 것 (워크플로 제한 45분) */
const STUCK_HOURS = 3;

/** 비정상 종료로 running에 남은 수집 기록을 error로 닫는다. 닫은 개수 */
export async function closeStuckRuns(db: Db): Promise<number> {
  const before = new Date(Date.now() - STUCK_HOURS * 3600_000).toISOString();
  const res = await db
    .from("ingest_runs")
    .update({ status: "error", finished_at: new Date().toISOString(), error: "중단됨 (기록이 running으로 남아 다음 실행이 닫음)" })
    .eq("status", "running")
    .lt("started_at", before)
    .select("id");
  return (check(res, "ingest_runs 정리") ?? []).length;
}

/**
 * 대시보드(Vercel)의 조회 캐시를 비운다 (app/api/revalidate). REVALIDATE_URL·REVALIDATE_SECRET이 없으면 건너뛴다.
 * 실패해도 수집은 성공으로 두고 경고만 남긴다 — 캐시는 1시간 뒤 저절로 새로 조회된다.
 */
export async function revalidateDashboard(): Promise<void> {
  const url = process.env.REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!url || !secret) {
    console.log("대시보드 캐시 비우기 건너뜀 (REVALIDATE_URL / REVALIDATE_SECRET 없음)");
    return;
  }
  try {
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log("대시보드 캐시 비움");
  } catch (e) {
    const msg = `대시보드 캐시 비우기 실패: ${(e as Error).message}`;
    console.warn(msg);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning::${msg}`);
  }
}

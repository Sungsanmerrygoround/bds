// 수집 기록(ingest_runs): 실거래 외 수집(금리·지수·단지정보)은 실행 하나를 한 줄로 남긴다
import { randomUUID } from "node:crypto";
import type { Job } from "./args";
import { check, type Db } from "./db";
import type { CallCounter } from "./http";

/** 실거래 외 수집(금리·지수·단지정보) 공통: ingest_runs 한 줄로 기록 */
export async function recordRun(
  db: Db, job: Job, source: "rate" | "index" | "kapt",
  work: (counter: CallCounter) => Promise<{ fetched: number; upserted: number; note?: string }>,
) {
  const counter: CallCounter = { calls: 0 };
  const run = check(
    await db.from("ingest_runs").insert({ batch_id: randomUUID(), job, source }).select("id").single(),
    "ingest_runs insert",
  ) as { id: number };
  try {
    const r = await work(counter);
    check(await db.from("ingest_runs").update({
      status: "ok", finished_at: new Date().toISOString(),
      fetched: r.fetched, upserted: r.upserted, api_calls: counter.calls, error: r.note ?? null,
    }).eq("id", run.id), "ingest_runs update");
  } catch (e) {
    await db.from("ingest_runs").update({
      status: "error", finished_at: new Date().toISOString(), api_calls: counter.calls, error: (e as Error).message,
    }).eq("id", run.id);
    throw e;
  }
}

// 수집 기록(ingest_runs): 실거래 외 수집(입주 물량·금리·지수·단지정보)은 실행 하나를 한 줄로 남긴다
import { randomUUID } from "node:crypto";
import type { Args } from "./args";
import { check, type Db } from "./db";
import type { CallCounter } from "./http";

export interface RunResult {
  fetched: number;
  upserted: number;
  note?: string; // 성공했지만 남길 말 (error 열에 기록)
}

/**
 * work를 실행하고 ingest_runs 한 줄로 기록한다 (시작 시 running → 끝나면 ok/error).
 * --dry면 기록 없이 work만 실행한다 (work 안에서 args.dry로 저장을 건너뛴다).
 */
export async function recordRun(
  db: Db, args: Pick<Args, "job" | "dry">, source: "supply" | "rate" | "index" | "kapt",
  work: (counter: CallCounter) => Promise<RunResult>,
): Promise<void> {
  const counter: CallCounter = { calls: 0 };
  if (args.dry) {
    await work(counter);
    return;
  }
  const run = check(
    await db.from("ingest_runs").insert({ batch_id: randomUUID(), job: args.job, source }).select("id").single(),
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

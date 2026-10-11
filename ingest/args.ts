// 수집 명령줄 인자: run.ts <job> [--lawd A,B] [--from YYYYMM --to YYYYMM] [--kind trade|rent] [--dry]
import type { Kind } from "./molit";

export const JOBS = ["backfill", "daily", "supply", "refresh", "rates", "index", "kapt"] as const;
export type Job = (typeof JOBS)[number];

export function parseArgs(argv: string[]) {
  const [job, ...rest] = argv;
  if (!(JOBS as readonly string[]).includes(job)) {
    throw new Error(`사용법: run.ts <${JOBS.join("|")}> [--lawd A,B] [--from YYYYMM --to YYYYMM] [--kind trade|rent] [--dry]`);
  }
  const opt = (name: string) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  return {
    job: job as Job,
    lawd: opt("lawd")?.split(","),
    from: opt("from"),
    to: opt("to"),
    // refresh는 등기일 반영용이라 매매만
    kinds: (opt("kind") ? [opt("kind")] : job === "refresh" ? ["trade"] : ["trade", "rent"]) as Kind[],
    dry: rest.includes("--dry"),
  };
}

export type Args = ReturnType<typeof parseArgs>;

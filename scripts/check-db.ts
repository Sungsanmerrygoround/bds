// Supabase 연결·스키마 상태 점검: npx tsx scripts/check-db.ts
import "../ingest/env";
import { serviceClient } from "../ingest/db";

async function main() {
  const db = serviceClient();
  for (const t of ["regions", "apt_trades", "apt_rents", "supply_projects", "ingest_runs"]) {
    // head:true는 오류 본문이 없어 테이블 부재를 못 잡으므로 1행 조회로 확인
    const r = await db.from(t).select("*", { count: "exact" }).limit(1);
    console.log(t.padEnd(16), r.error ? `ERR ${r.error.code} ${r.error.message}` : `OK ${r.count}행`);
  }
}
main();

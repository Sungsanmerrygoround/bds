// 수집 실행 진입점
//   npm run ingest -- backfill                  최근 36개월 매매·전월세 (이벤트 판단 안 함 = 기준선)
//   npm run ingest -- daily                     최근 3개월 재수집 + 신고가·하락 판단
//   npm run ingest -- supply                    청약홈 입주 물량
// 옵션: --lawd 41117,41131  --from 202607 --to 202607  --kind trade|rent  --dry(DB 없이 결과만 출력)

import { randomUUID } from "node:crypto";
import "./env";
import { fetchAllApplyhome, toSupplyRows } from "./applyhome";
import { check, getSettingNum, loadRegions, serviceClient } from "./db";
import { FatalApiError, type CallCounter } from "./http";
import { fetchMonth, type Kind } from "./molit";
import { normalizeRents, normalizeTrades, type Region } from "./normalize";
import { storeMonth, upsertComplexes } from "./store";

type Job = "backfill" | "daily" | "supply";

function parseArgs(argv: string[]) {
  const [job, ...rest] = argv;
  if (!["backfill", "daily", "supply"].includes(job)) {
    throw new Error("사용법: run.ts <backfill|daily|supply> [--lawd A,B] [--from YYYYMM --to YYYYMM] [--kind trade|rent] [--dry]");
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
    kinds: (opt("kind") ? [opt("kind")] : ["trade", "rent"]) as Kind[],
    dry: rest.includes("--dry"),
  };
}

/** KST 기준 이번 달부터 거꾸로 n개월 (오래된 순) */
function recentMonths(n: number): string[] {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(4));
  while (y * 100 + m <= Number(to)) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

const won = (man: number) => `${(man / 10000).toFixed(2)}억`;

async function runDry(args: ReturnType<typeof parseArgs>) {
  if (!args.lawd || !args.from) throw new Error("--dry 에는 --lawd 와 --from 이 필요합니다");
  const counter: CallCounter = { calls: 0 };
  const months = monthRange(args.from, args.to ?? args.from);
  for (const lawd of args.lawd) {
    // DB 없이: 법정동 필터 없는 임시 region (창곡동 제외 등은 실제 실행에서 적용됨)
    const regions: Region[] = [{ id: 0, lawd_cd: lawd, include_dongs: [], exclude_dongs: [], supply_address_patterns: [] }];
    for (const ym of months) {
      for (const kind of args.kinds) {
        const items = await fetchMonth(kind, lawd, ym, counter);
        const n = kind === "trade" ? normalizeTrades(items, regions, lawd, ym) : normalizeRents(items, regions, lawd, ym);
        console.log(`\n[${kind}] ${lawd} ${ym}: API ${items.length}건 → 저장 대상 ${n.rows.length}건, 55㎡ 미만 제외 ${n.skipped.small_area}건, 단지 ${n.complexes.length}개`);
        if (kind === "trade") {
          const t = n.rows as ReturnType<typeof normalizeTrades>["rows"];
          const cancelled = t.filter((r) => r.is_cancelled).length;
          const direct = t.filter((r) => r.dealing_type === "직거래").length;
          const dupes = t.filter((r) => !r.trade_key.endsWith("#1")).length;
          console.log(`  해제 ${cancelled}건 / 직거래 ${direct}건 / 동일 키 중복(#2 이상) ${dupes}건`);
          for (const r of t.slice(0, 5)) {
            const name = n.complexes.find((c) => c.apt_seq === r.apt_seq)?.apt_nm;
            console.log(`  ${r.deal_date} ${name} ${r.exclu_area}㎡ ${r.floor}층 ${won(r.price_man)} ${r.dealing_type ?? ""}${r.is_cancelled ? " [해제 " + r.cancel_date + "]" : ""}  key=${r.trade_key}`);
          }
        } else {
          const t = n.rows as ReturnType<typeof normalizeRents>["rows"];
          const jeonse = t.filter((r) => r.monthly_rent_man === 0).length;
          console.log(`  전세 ${jeonse}건 / 월세 ${t.length - jeonse}건`);
          for (const r of t.slice(0, 5)) {
            const name = n.complexes.find((c) => c.apt_seq === r.apt_seq)?.apt_nm;
            console.log(`  ${r.deal_date} ${name} ${r.exclu_area}㎡ ${r.floor}층 보증금 ${won(r.deposit_man)} 월 ${r.monthly_rent_man}만 ${r.contract_type ?? ""}`);
          }
        }
      }
    }
  }
  console.log(`\nAPI 호출 ${counter.calls}회`);
}

async function runDeals(args: ReturnType<typeof parseArgs>) {
  const db = serviceClient();
  const batchId = randomUUID();
  const counter: CallCounter = { calls: 0 };
  const allRegions = await loadRegions(db);
  const regions = allRegions.filter((r) => r.is_active);
  const lawdCodes = [...new Set(regions.map((r) => r.lawd_cd))].filter((c) => !args.lawd || args.lawd.includes(c));

  const months =
    args.from ? monthRange(args.from, args.to ?? args.from)
    : args.job === "daily" ? recentMonths(await getSettingNum(db, "daily_lookback_months", 3))
    : recentMonths(36);

  console.log(`[${args.job}] batch=${batchId} 지역 ${lawdCodes.join(",")} / ${months[0]}~${months.at(-1)} / ${args.kinds.join("+")}`);
  const changedTradeIds: number[] = [];
  let errors = 0;

  for (const lawd of lawdCodes) {
    for (const ym of months) {
      for (const kind of args.kinds) {
        const run = check(
          await db.from("ingest_runs")
            .insert({ batch_id: batchId, job: args.job, source: kind, lawd_cd: lawd, deal_ymd: ym })
            .select("id").single(),
          "ingest_runs insert",
        ) as { id: number };
        const callsBefore = counter.calls;
        try {
          const items = await fetchMonth(kind, lawd, ym, counter);
          const n = kind === "trade" ? normalizeTrades(items, regions, lawd, ym) : normalizeRents(items, regions, lawd, ym);
          await upsertComplexes(db, n.complexes, kind);
          const r = await storeMonth(db, kind, lawd, ym, n.rows);
          if (kind === "trade") changedTradeIds.push(...r.changedIds);
          const skipped = n.skipped.small_area + n.skipped.out_of_region;
          check(await db.from("ingest_runs").update({
            status: "ok", finished_at: new Date().toISOString(),
            fetched: items.length, skipped, upserted: r.upserted, inserted: r.inserted,
            marked_missing: r.markedMissing, api_calls: counter.calls - callsBefore,
            error: r.missingGuardTripped ? "기존 행 20% 이상이 응답에서 사라져 missing 처리를 건너뜀" : null,
          }).eq("id", run.id), "ingest_runs update");
          console.log(`  ${kind} ${lawd} ${ym}: 응답 ${items.length} / 저장 ${r.upserted} (신규 ${r.inserted}) / 제외 ${skipped} / missing ${r.markedMissing}${r.missingGuardTripped ? " ⚠가드" : ""}`);
        } catch (e) {
          errors++;
          const msg = (e as Error).message;
          console.error(`  ✗ ${kind} ${lawd} ${ym}: ${msg}`);
          await db.from("ingest_runs").update({
            status: "error", finished_at: new Date().toISOString(),
            api_calls: counter.calls - callsBefore, error: msg,
          }).eq("id", run.id);
          if (e instanceof FatalApiError) throw e; // 키 오류·호출 한도 초과: 계속해도 의미 없음
        }
      }
    }
  }

  // 이벤트: 백필은 기준선이라 판단하지 않음. daily에서만 새로 들어온/바뀐 거래를 판단.
  const validity = check(await db.rpc("refresh_event_validity"), "refresh_event_validity") as number;
  let created = 0;
  if (args.job === "daily" && changedTradeIds.length > 0) {
    for (let i = 0; i < changedTradeIds.length; i += 1000) {
      created += check(await db.rpc("detect_events", { p_trade_ids: changedTradeIds.slice(i, i + 1000) }), "detect_events") as number;
    }
  }
  if (created > 0) {
    await db.from("ingest_runs").insert({
      batch_id: batchId, job: args.job, source: "trade", status: "ok",
      finished_at: new Date().toISOString(), events_created: created,
    });
  }
  console.log(`\n완료: API 호출 ${counter.calls}회, 오류 ${errors}건, 이벤트 신규 ${created}건, 유효성 갱신 ${validity}건`);
  if (errors > 0) process.exitCode = 1;
}

async function runSupply(args: ReturnType<typeof parseArgs>) {
  const counter: CallCounter = { calls: 0 };
  const items = await fetchAllApplyhome(counter);
  if (args.dry) {
    console.log(`청약홈 전체 ${items.length}건 (API ${counter.calls}회). --dry는 지역 매칭 없이 종료합니다.`);
    return;
  }
  const db = serviceClient();
  const batchId = randomUUID();
  const run = check(
    await db.from("ingest_runs").insert({ batch_id: batchId, job: "supply", source: "supply" }).select("id").single(),
    "ingest_runs insert",
  ) as { id: number };
  const regions = (await loadRegions(db)).filter((r) => r.is_active);
  const rows = toSupplyRows(items, regions).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  // total_households_override는 payload에 없으므로 직접 입력한 보정값이 유지된다
  check(await db.from("supply_projects").upsert(rows, { onConflict: "house_manage_no" }), "supply_projects upsert");
  check(await db.from("ingest_runs").update({
    status: "ok", finished_at: new Date().toISOString(),
    fetched: items.length, upserted: rows.length, api_calls: counter.calls,
  }).eq("id", run.id), "ingest_runs update");
  const excluded = rows.filter((r) => r.is_excluded);
  console.log(`청약홈 ${items.length}건 중 관심 지역 ${rows.length}건 저장 (입주 물량 제외 ${excluded.length}건), API ${counter.calls}회`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.job === "supply") return runSupply(args);
  if (args.dry) return runDry(args);
  return runDeals(args);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

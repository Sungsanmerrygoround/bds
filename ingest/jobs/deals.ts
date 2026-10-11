// 실거래(매매·전월세) 수집: backfill · daily · refresh, 그리고 DB 없이 결과만 보는 --dry
import { randomUUID } from "node:crypto";
import { monthsBetween, recentMonths } from "../../lib/range";
import type { Args } from "../args";
import { formatEok } from "../../lib/format";
import { check, getSettingNum, loadRegions, serviceClient, type Db } from "../db";
import { FatalApiError, type CallCounter } from "../http";
import { fetchMonth } from "../molit";
import { normalizeRents, normalizeTrades, type Region } from "../normalize";
import { storeMonth, upsertComplexes } from "../store";

/** 주간 재수집 범위: N~M개월 전 계약월 (daily가 다시 받는 최근 달은 뺀다) */
async function refreshMonths(db: Db): Promise<string[]> {
  const from = await getSettingNum(db, "refresh_months_from", 3);
  const to = await getSettingNum(db, "refresh_months_to", 8);
  return recentMonths(to + 1).slice(0, to - from + 1);
}

export async function runDry(args: Args) {
  if (!args.lawd || !args.from) throw new Error("--dry 에는 --lawd 와 --from 이 필요합니다");
  const counter: CallCounter = { calls: 0 };
  const months = monthsBetween(args.from, args.to ?? args.from);
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
            console.log(`  ${r.deal_date} ${name} ${r.exclu_area}㎡ ${r.floor}층 ${formatEok(r.price_man)} ${r.dealing_type ?? ""}${r.is_cancelled ? " [해제 " + r.cancel_date + "]" : ""}  key=${r.trade_key}`);
          }
        } else {
          const t = n.rows as ReturnType<typeof normalizeRents>["rows"];
          const jeonse = t.filter((r) => r.monthly_rent_man === 0).length;
          console.log(`  전세 ${jeonse}건 / 월세 ${t.length - jeonse}건`);
          for (const r of t.slice(0, 5)) {
            const name = n.complexes.find((c) => c.apt_seq === r.apt_seq)?.apt_nm;
            console.log(`  ${r.deal_date} ${name} ${r.exclu_area}㎡ ${r.floor}층 보증금 ${formatEok(r.deposit_man)} 월 ${r.monthly_rent_man}만 ${r.contract_type ?? ""}`);
          }
        }
      }
    }
  }
  console.log(`\nAPI 호출 ${counter.calls}회`);
}

export async function runDeals(args: Args) {
  const db = serviceClient();
  const batchId = randomUUID();
  const counter: CallCounter = { calls: 0 };
  const allRegions = await loadRegions(db);
  const regions = allRegions.filter((r) => r.is_active);
  const lawdCodes = [...new Set(regions.map((r) => r.lawd_cd))].filter((c) => !args.lawd || args.lawd.includes(c));

  const months =
    args.from ? monthsBetween(args.from, args.to ?? args.from)
    : args.job === "daily" ? recentMonths(await getSettingNum(db, "daily_lookback_months", 3))
    : args.job === "refresh" ? await refreshMonths(db)
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
          if (process.env.GITHUB_ACTIONS) console.log(`::error::${kind} ${lawd} ${ym}: ${msg.replace(/\r?\n/g, " ")}`);
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

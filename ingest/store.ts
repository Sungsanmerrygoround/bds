// 한 시군구·한 달 단위 적재: upsert + 응답에서 사라진 행 missing 처리

import type { SupabaseClient } from "@supabase/supabase-js";
import { check, selectAll } from "./db";
import type { Kind } from "./molit";
import type { ComplexRow, RentRow, TradeRow } from "./normalize";

const TABLE: Record<Kind, { table: string; key: string }> = {
  trade: { table: "apt_trades", key: "trade_key" },
  rent: { table: "apt_rents", key: "rent_key" },
};

// 기존 행 중 이 비율 이상이 한 번에 사라지면 API 이상으로 보고 missing 처리를 건너뛴다.
const MISSING_GUARD_RATIO = 0.2;
const CHUNK = 500;

export interface StoreResult {
  upserted: number;
  inserted: number;
  markedMissing: number;
  missingGuardTripped: boolean;
  /** 새로 들어왔거나 해제 여부가 바뀐 거래 id (이벤트 판단 대상) */
  changedIds: number[];
}

export async function upsertComplexes(db: SupabaseClient, rows: ComplexRow[], kind: Kind) {
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  // 전월세 API는 umdCd 등이 없어서 매매에서 받은 단지 정보를 덮어쓰지 않도록 신규만 넣는다.
  const res = await db
    .from("complexes")
    .upsert(payload, { onConflict: "apt_seq", ignoreDuplicates: kind === "rent" });
  check(res, "complexes upsert");
}

export async function storeMonth(
  db: SupabaseClient,
  kind: Kind,
  lawdCd: string,
  ym: string,
  rows: Array<TradeRow | RentRow>,
): Promise<StoreResult> {
  const { table, key } = TABLE[kind];
  const cancelCol = kind === "trade" ? ", is_cancelled" : "";

  type Existing = { id: number; key: string; missing_since: string | null; is_cancelled?: boolean };
  const existingRows = await selectAll<Existing>(
    (from, to) =>
      db
        .from(table)
        .select(`id, key:${key}, missing_since${cancelCol}`)
        .eq("lawd_cd", lawdCd)
        .eq("deal_ymd", ym)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Existing[] | null; error: { message: string } | null }>,
    `${table} 기존 행 조회`,
  );
  const existing = new Map(existingRows.map((r) => [r.key, r]));

  const now = new Date().toISOString();
  const changedIds: number[] = [];
  let inserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    // first_seen_at은 넣지 않는다 → 신규일 때만 default(now())가 들어감
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, last_seen_at: now, missing_since: null }));
    const res = await db
      .from(table)
      .upsert(chunk, { onConflict: key })
      .select(`id, key:${key}${cancelCol}`);
    const saved = check(res, `${table} upsert`) as unknown as Array<{ id: number; key: string; is_cancelled?: boolean }>;
    for (const s of saved) {
      const before = existing.get(s.key);
      if (!before) {
        inserted++;
        changedIds.push(s.id);
      } else if (before.missing_since || before.is_cancelled !== s.is_cancelled) {
        changedIds.push(s.id);
      }
    }
  }

  // 이번 응답에 없는 기존 행 → missing_since 기록 (삭제하지 않음)
  const fetchedKeys = new Set(rows.map((r) => ("trade_key" in r ? r.trade_key : r.rent_key)));
  const toMark = existingRows.filter((r) => !r.missing_since && !fetchedKeys.has(r.key)).map((r) => r.id);
  const activeBefore = existingRows.filter((r) => !r.missing_since).length;
  const guardTripped = activeBefore > 0 && toMark.length / activeBefore >= MISSING_GUARD_RATIO && toMark.length > 3;

  if (toMark.length > 0 && !guardTripped) {
    for (let i = 0; i < toMark.length; i += CHUNK) {
      const res = await db.from(table).update({ missing_since: now }).in("id", toMark.slice(i, i + CHUNK));
      check(res, `${table} missing 처리`);
    }
    if (kind === "trade") changedIds.push(...toMark);
  }

  return {
    upserted: rows.length,
    inserted,
    markedMissing: guardTripped ? 0 : toMark.length,
    missingGuardTripped: guardTripped,
    changedIds,
  };
}

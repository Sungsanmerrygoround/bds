// K-apt 단지 기본정보 수집: 없는·오래된 단지만 받아 캐시(kapt_complexes) → 실거래 단지와 짝지어 complex_info
import { recentMonths } from "../../lib/range";
import type { Args } from "../args";
import { check, loadRegions, selectAll, serviceClient } from "../db";
import { FatalApiError, type CallCounter } from "../http";
import { fetchKaptBasis, fetchKaptList, fetchKaptParking, jibunFromAddr, matchComplexes, type KaptCandidate, type OurComplex } from "../kapt";
import { recordRun } from "../runlog";

const KAPT_STALE_DAYS = 60; // 기본정보·주차를 다시 받는 주기 (세대수 등은 거의 안 바뀜)

interface KaptRow {
  kapt_code: string; kapt_name: string; lawd_cd: string; bjd_code: string; dong: string; kapt_addr: string | null; jibun: string | null;
  households: number | null; dong_count: number | null; top_floor: number | null; use_date: string | null; heat_type: string | null;
  parking: number | null; road_addr: string | null; is_listed: boolean; basis_at: string | null; parking_at: string | null;
}

export async function runKapt(args: Args) {
  const db = serviceClient();
  const regions = (await loadRegions(db)).filter((r) => r.is_active);
  const lawdCodes = [...new Set(regions.map((r) => r.lawd_cd))].filter((c) => !args.lawd || args.lawd.includes(c));
  const ours = await selectAll<OurComplex>(
    (a, b) => db.from("complexes").select("apt_seq, apt_nm, lawd_cd, umd_cd, umd_nm, jibun, build_year").in("lawd_cd", lawdCodes).order("apt_seq").range(a, b),
    "complexes 조회",
  );
  const overrides = new Map(
    (check(await db.from("complex_kapt_override").select("apt_seq, kapt_code"), "complex_kapt_override") as { apt_seq: string; kapt_code: string | null }[])
      .map((o) => [o.apt_seq, o.kapt_code]),
  );
  const loadCache = () => selectAll<KaptRow>(
    (a, b) => db.from("kapt_complexes").select("*").in("lawd_cd", lawdCodes).order("kapt_code").range(a, b),
    "kapt_complexes 조회",
  );

  const work = async (counter: CallCounter) => {
    // K-apt는 가끔 수십 번 호출 뒤 한동안 오류(04)를 낸다. 띄엄띄엄 실패는 건너뛰고, 5번 연속이면 받기를 멈추고
    // 지금까지 모은 캐시로 짝짓기만 한다 (받은 단지는 바로 저장하므로 다음 실행이 이어 받는다).
    let failed = 0, streak = 0, halted = false;
    const tolerant = async <T>(what: string, call: () => Promise<T>): Promise<T | undefined> => {
      if (halted) return undefined;
      try {
        const r = await call();
        streak = 0;
        return r;
      } catch (e) {
        if (e instanceof FatalApiError) throw e;
        failed++;
        console.warn(`  ✗ ${what}: ${(e as Error).message}`);
        if (++streak >= 5) {
          halted = true;
          console.warn("  K-apt 연속 실패: 이번 실행은 받기를 멈춤");
        }
        return undefined;
      }
    };
    const now = () => new Date().toISOString();
    const staleBefore = new Date(Date.now() - KAPT_STALE_DAYS * 86400_000).toISOString();

    // 1) 단지 목록 → 캐시에 등록 (목록에서 빠진 단지는 is_listed=false)
    for (const lawd of lawdCodes) {
      const list = await tolerant(`${lawd} 단지 목록`, () => fetchKaptList(lawd, counter));
      if (!list) continue;
      const t = now();
      const rows = list.map((k) => ({ kapt_code: k.kaptCode, kapt_name: k.kaptName, lawd_cd: lawd, bjd_code: k.bjdCode, dong: k.dong, is_listed: true, listed_at: t }));
      if (!args.dry) {
        check(await db.from("kapt_complexes").upsert(rows, { onConflict: "kapt_code" }), "kapt_complexes 목록 upsert");
        check(await db.from("kapt_complexes").update({ is_listed: false }).eq("lawd_cd", lawd).lt("listed_at", t), "kapt_complexes 목록 정리");
      }
      console.log(`  ${lawd}: K-apt 목록 ${list.length}개`);
    }

    // 2) 기본정보가 없거나 오래된 단지만 받는다
    let cache = await loadCache();
    const todo = cache
      .filter((k) => k.is_listed && (!k.basis_at || k.basis_at < staleBefore))
      .sort((a, b) => (a.basis_at ?? "").localeCompare(b.basis_at ?? ""));
    let got = 0;
    for (const k of todo) {
      const b = await tolerant(`${k.kapt_name} 기본정보`, () => fetchKaptBasis(k.kapt_code, counter));
      if (b === undefined) {
        if (halted) break;
        continue;
      }
      got++;
      if (args.dry) continue;
      const patch = b
        ? {
            kapt_addr: b.kaptAddr, jibun: jibunFromAddr(b.kaptAddr, k.dong), households: b.households, dong_count: b.dongCount,
            top_floor: b.topFloor, use_date: b.useDate, heat_type: b.heatType, road_addr: b.roadAddr, basis_at: now(),
          }
        : { basis_at: now() }; // K-apt에 정보가 없는 단지: 다시 받는 주기까지 건너뜀
      check(await db.from("kapt_complexes").update(patch).eq("kapt_code", k.kapt_code), "kapt_complexes 기본정보");
    }
    console.log(`  기본정보: 받을 단지 ${todo.length}개 중 ${got}개 받음`);

    // 3) 캐시로 짝짓기
    cache = await loadCache();
    const ready = cache.filter((k) => k.is_listed && k.basis_at && k.households != null);
    const cands: KaptCandidate[] = ready.map((k) => ({ kaptCode: k.kapt_code, kaptName: k.kapt_name, bjdCode: k.bjd_code, dong: k.dong, jibun: k.jibun, useYear: k.use_date ? Number(k.use_date.slice(0, 4)) : null }));
    const byCode = new Map(cache.map((k) => [k.kapt_code, k]));
    const valid = matchComplexes(ours, cands, overrides).filter((m) => byCode.get(m.kaptCode)?.basis_at);

    // 4) 짝지은 단지만 주차 대수 (없거나 오래된 것)
    let parkingGot = 0;
    for (const code of new Set(valid.map((m) => m.kaptCode))) {
      const k = byCode.get(code)!;
      if (k.parking_at && k.parking_at >= staleBefore) continue;
      const n = await tolerant(`${k.kapt_name} 주차`, () => fetchKaptParking(code, counter));
      if (n === undefined) {
        if (halted) break;
        continue;
      }
      parkingGot++;
      k.parking = n;
      if (!args.dry) check(await db.from("kapt_complexes").update({ parking: n, parking_at: now() }).eq("kapt_code", code), "kapt_complexes 주차");
    }

    // 결과 보고
    const pending = cache.filter((k) => k.is_listed && !k.basis_at).length;
    const byMethod = (m: string) => valid.filter((v) => v.method === m).length;
    console.log(
      `\n짝지음 ${valid.length}/${ours.length} (지번 ${byMethod("jibun")}, 이름 ${byMethod("name")}, 수동 ${byMethod("manual")}), ` +
        `K-apt ${new Set(valid.map((v) => v.kaptCode)).size}/${ready.length}개 사용, 기본정보 못 받은 K-apt 단지 ${pending}개, 주차 새로 ${parkingGot}개`,
    );
    const matched = new Set(valid.map((v) => v.apt_seq));
    for (const lawd of lawdCodes) {
      const mine = ours.filter((o) => o.lawd_cd === lawd);
      console.log(`  ${lawd}: ${mine.filter((o) => matched.has(o.apt_seq)).length}/${mine.length}`);
    }
    const rank = check(
      await db.rpc("complex_rank", { p_group_id: null, p_area_band: null, p_end: recentMonths(3)[0] }),
      "complex_rank",
    ) as { apt_seq: string; trades_12m: number }[];
    const trades = new Map(rank.map((r) => [r.apt_seq, r.trades_12m]));
    const unmatched = ours
      .filter((o) => !matched.has(o.apt_seq) && !overrides.has(o.apt_seq))
      .sort((a, b) => (trades.get(b.apt_seq) ?? 0) - (trades.get(a.apt_seq) ?? 0));
    console.log(`\n짝 없는 단지 중 최근 12개월 매매 많은 순:`);
    for (const o of unmatched.slice(0, 30)) console.log(`  ${o.apt_seq} ${o.apt_nm} (${o.umd_nm} ${o.jibun}) 매매 ${trades.get(o.apt_seq) ?? 0}건`);
    const nameOf = (seq: string) => ours.find((o) => o.apt_seq === seq)?.apt_nm;
    const dupes = [...Map.groupBy(valid, (v) => v.kaptCode)].filter(([, v]) => v.length > 1);
    if (dupes.length) {
      console.log(`\nK-apt 단지 하나에 여러 실거래 단지 ${dupes.length}건: ${dupes.map(([k, v]) => `${byCode.get(k)?.kapt_name}←${v.map((x) => nameOf(x.apt_seq)).join("+")}`).join(", ")}`);
    }
    const weak = valid.filter((v) => v.method !== "manual" && v.score < 0.5);
    if (weak.length) {
      console.log(`\n이름이 많이 다른 짝 ${weak.length}건: ${weak.map((v) => `${nameOf(v.apt_seq)}↔${byCode.get(v.kaptCode)?.kapt_name}(${v.method} ${v.score.toFixed(2)})`).join(", ")}`);
    }
    console.log(`\nAPI 호출 ${counter.calls}회, 실패 ${failed}회${halted ? " (연속 실패로 중단, 다음 실행이 이어 받음)" : ""}`);

    if (args.dry) return { fetched: got, upserted: 0 };

    // 5) complex_info: 이번 짝 upsert, 짝이 없어진 행은 캐시가 다 찼을 때만 삭제
    const t = now();
    const rows = valid.map((m) => {
      const k = byCode.get(m.kaptCode)!;
      return {
        apt_seq: m.apt_seq, kapt_code: m.kaptCode, kapt_name: k.kapt_name, kapt_addr: k.kapt_addr,
        households: k.households, dong_count: k.dong_count, top_floor: k.top_floor, use_date: k.use_date,
        heat_type: k.heat_type, parking: k.parking, road_addr: k.road_addr,
        match_method: m.method, match_score: Number(m.score.toFixed(3)), updated_at: t,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      check(await db.from("complex_info").upsert(rows.slice(i, i + 500), { onConflict: "apt_seq" }), "complex_info upsert");
    }
    let removed = 0;
    if (pending === 0) {
      const existing = await selectAll<{ apt_seq: string }>(
        (a, b) => db.from("complex_info").select("apt_seq, complexes!inner(lawd_cd)").in("complexes.lawd_cd", lawdCodes).order("apt_seq").range(a, b),
        "complex_info 조회",
      );
      const stale = existing.map((e) => e.apt_seq).filter((s) => !matched.has(s));
      for (let i = 0; i < stale.length; i += 200) {
        check(await db.from("complex_info").delete().in("apt_seq", stale.slice(i, i + 200)), "complex_info delete");
      }
      removed = stale.length;
    }
    console.log(`complex_info 저장 ${rows.length}행, 삭제 ${removed}행`);
    return {
      fetched: got,
      upserted: rows.length,
      note: pending > 0 || halted ? `K-apt 기본정보 ${pending}개 남음${halted ? " (연속 실패로 중단)" : ""}` : undefined,
    };
  };
  if (args.dry) {
    await work({ calls: 0 });
    return;
  }
  await recordRun(db, "kapt", "kapt", work);
}

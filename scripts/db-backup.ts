// DB 백업·복원 (Supabase 무료 플랜은 자동 백업이 없다). 표 구조는 supabase/migrations에 있으므로 데이터만 담는다.
//
//   npm run db:backup                         백업 → backups/<시각>/ (표마다 CSV.gz + manifest.json), 최근 KEEP개만 남김
//   npm run db:backup -- --if-older-than 6    최근 백업이 6일 안이면 건너뜀 (작업 스케줄러용, scripts/backup-task.ps1)
//   npm run db:backup -- --with-raw           거래 원본 응답(raw, 약 90MB, 화면에서 안 씀)까지
//   npm run db:restore -- <백업 폴더> --target <postgres 주소> --yes
//       대상 DB의 같은 표를 모두 비우고 백업으로 채운다. 대상에는 먼저 마이그레이션을 적용해 둔다
//       (npx supabase db push --db-url <대상>). 운영 DB(SUPABASE_DB_URL)로는 --force-production 없이 거절.
//   npm run db:verify-backup [-- <백업 폴더>] 백업을 메모리 Postgres(PGlite)에 실제로 복원해 행 수를 대조 (기본: 가장 최근 백업)
//
// 접속은 .env.local의 SUPABASE_DB_URL(세션 풀러). 백업 폴더 기본값은 저장소의 backups/(git 제외, OneDrive가 클라우드로 동기화),
// BACKUP_DIR로 바꿀 수 있다. 백업은 한 번의 읽기 전용 트랜잭션(repeatable read)이라 표끼리 시점이 맞는다.
import "../ingest/env";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip, gunzipSync } from "node:zlib";
import postgres from "postgres";

const KEEP = 8;
const ROOT = resolve(__dirname, "..");
const BACKUP_DIR = process.env.BACKUP_DIR ? resolve(process.env.BACKUP_DIR) : join(ROOT, "backups");

export interface TableInfo {
  name: string;
  columns: string[]; // 생성 열(generated)은 복원 때 다시 계산되므로 뺀다
  rows: number;
  serial: string | null; // id 같은 시퀀스 열 → 복원 뒤 시퀀스를 최댓값으로
}
export interface Manifest {
  created_at: string;
  with_raw: boolean;
  migrations: string[];
  tables: TableInfo[]; // 외래키 순서 (참조되는 표가 먼저)
}

const connect = (url: string) => postgres(url, { max: 1, prepare: false, onnotice: () => {} });

/** 외래키 순서로 정렬: 참조되는 표가 먼저 (복원 때 이 순서로 넣는다) */
export function fkOrder(tables: string[], refs: { from: string; to: string }[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (t: string, path: Set<string>) => {
    if (seen.has(t) || path.has(t)) return;
    path.add(t);
    for (const r of refs) if (r.from === t && r.to !== t && tables.includes(r.to)) visit(r.to, path);
    seen.add(t);
    out.push(t);
  };
  for (const t of [...tables].sort()) visit(t, new Set());
  return out;
}

async function backup(withRaw: boolean) {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL이 .env.local에 없습니다");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = join(BACKUP_DIR, stamp);
  mkdirSync(dir, { recursive: true });
  const sql = connect(url);
  const started = Date.now();
  try {
    const manifest = await sql.begin("isolation level repeatable read read only", async (tx) => {
      const tables = (await tx<{ name: string }[]>`
        select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`).map((r) => r.name);
      const refs = await tx<{ from: string; to: string }[]>`
        select cl.relname as from, rf.relname as to from pg_constraint co
        join pg_class cl on cl.oid = co.conrelid join pg_class rf on rf.oid = co.confrelid
        join pg_namespace n on n.oid = cl.relnamespace where co.contype = 'f' and n.nspname = 'public'`;
      const migrations = (await tx<{ version: string }[]>`select version from supabase_migrations.schema_migrations order by version`).map((r) => r.version);

      const infos: TableInfo[] = [];
      for (const name of fkOrder(tables, [...refs])) {
        const cols = await tx<{ attname: string; serial: boolean; notnull: boolean }[]>`
          select a.attname, a.attnotnull as notnull, pg_get_serial_sequence(${"public." + name}, a.attname) is not null as serial
          from pg_attribute a where a.attrelid = ${"public." + name}::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
          order by a.attnum`;
        // 원본 응답(raw)은 비워도 되는 표(거래)에서만 뺀다 — 입주 물량 등은 raw가 필수 열이고 작다
        const columns = cols.filter((c) => withRaw || c.attname !== "raw" || c.notnull).map((c) => c.attname);
        const [{ n }] = await tx<{ n: string }[]>`select count(*) as n from ${tx(name)}`;
        const colList = columns.map((c) => `"${c}"`).join(", ");
        const readable = await tx.unsafe(`copy public."${name}" (${colList}) to stdout with (format csv, header)`).readable();
        await pipeline(readable, createGzip(), createWriteStream(join(dir, `${name}.csv.gz`)));
        infos.push({ name, columns, rows: Number(n), serial: cols.find((c) => c.serial)?.attname ?? null });
        console.log(`  ${name.padEnd(24)} ${String(n).padStart(7)}행`);
      }
      return { created_at: new Date().toISOString(), with_raw: withRaw, migrations, tables: infos } satisfies Manifest;
    });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  } catch (e) {
    rmSync(dir, { recursive: true, force: true }); // 반쯤 만든 백업은 남기지 않는다
    throw e;
  } finally {
    await sql.end();
  }
  const size = readdirSync(dir).reduce((s, f) => s + statSync(join(dir, f)).size, 0);
  console.log(`백업 완료: ${dir} (${(size / 1024 / 1024).toFixed(1)}MB, ${((Date.now() - started) / 1000).toFixed(0)}초)`);

  const all = listBackups();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
    rmSync(join(BACKUP_DIR, old), { recursive: true, force: true });
    console.log(`오래된 백업 삭제: ${old}`);
  }
}

/** 완성된 백업 폴더 (manifest.json이 있는 것), 오래된 순 */
function listBackups(): string[] {
  try {
    return readdirSync(BACKUP_DIR).filter((d) => { try { return statSync(join(BACKUP_DIR, d, "manifest.json")).isFile(); } catch { return false; } }).sort();
  } catch {
    return [];
  }
}

/** 복원 대상에 대한 최소 연산 (한 트랜잭션 안에서 호출된다) */
interface RestoreOps {
  exec(sql: string): Promise<unknown>;
  /** copy ... from stdin 문과 gzip CSV 파일 → 넣기 */
  copyIn(copySql: string, gzFile: string): Promise<void>;
  count(table: string): Promise<number>;
}

/** 복원 순서: 같은 표를 모두 비우고(마이그레이션의 시드 행 포함) 외래키 순서로 채운 뒤 시퀀스를 최댓값으로. 반환: 표별 행 수 */
async function restoreWith(dir: string, manifest: Manifest, ops: RestoreOps): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await ops.exec(`truncate ${manifest.tables.map((t) => `public."${t.name}"`).join(", ")} restart identity cascade`);
  for (const t of manifest.tables) {
    const colList = t.columns.map((c) => `"${c}"`).join(", ");
    await ops.copyIn(`copy public."${t.name}" (${colList}) from stdin with (format csv, header)`, join(dir, `${t.name}.csv.gz`));
    if (t.serial) {
      await ops.exec(`select setval(pg_get_serial_sequence('public."${t.name}"', '${t.serial}'), coalesce(max("${t.serial}"), 1), max("${t.serial}") is not null) from public."${t.name}"`);
    }
    counts.set(t.name, await ops.count(t.name));
  }
  return counts;
}

/** 백업 폴더의 데이터로 Postgres 대상을 채운다 (같은 표는 모두 비움, 실패하면 전부 되돌림) */
export async function restore(dir: string, targetUrl: string): Promise<Map<string, number>> {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
  const sql = connect(targetUrl);
  try {
    return await sql.begin((tx) => restoreWith(dir, manifest, {
      exec: (q) => tx.unsafe(q),
      copyIn: async (q, file) => pipeline(createReadStream(file), createGunzip(), await tx.unsafe(q).writable()),
      count: async (t) => Number((await tx<{ n: string }[]>`select count(*) as n from ${tx(t)}`)[0].n),
    }));
  } finally {
    await sql.end();
  }
}

/** 복원 결과가 manifest의 행 수와 같은지. 다른 표 목록 (비면 정상) */
export function compareCounts(manifest: Manifest, counts: Map<string, number>): string[] {
  return manifest.tables.filter((t) => counts.get(t.name) !== t.rows).map((t) => `${t.name}: 백업 ${t.rows}행, 복원 ${counts.has(t.name) ? `${counts.get(t.name)}행` : "없음"}`);
}

/** 백업을 메모리 Postgres(PGlite, 마이그레이션 적용)에 복원 순서 그대로 넣어 본다 */
async function verify(dir: string) {
  const { PGlite } = await import("@electric-sql/pglite");
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated;"); // Supabase 기본 역할 흉내 (마이그레이션 테스트와 같음)
  const migDir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) await db.exec(readFileSync(join(migDir, f), "utf8"));
  const local = files.map((f) => f.slice(0, 14));
  const missing = manifest.migrations.filter((v) => !local.includes(v));
  if (missing.length) console.log(`⚠ 백업 당시 DB에 있던 마이그레이션 중 저장소에 없는 것: ${missing.join(", ")}`);

  const started = Date.now();
  try {
    // PGlite는 copy from stdin을 자체 API의 '/dev/blob'으로만 받으므로 넣는 방법만 바꾸고 순서·비우기·시퀀스는 같은 restoreWith로
    const counts = await db.transaction((tx) => restoreWith(dir, manifest, {
      exec: (q) => tx.exec(q),
      copyIn: async (q, file) => {
        await tx.query(q.replace("from stdin", "from '/dev/blob'"), [], { blob: new Blob([gunzipSync(readFileSync(file))]) });
      },
      count: async (t) => (await tx.query<{ n: number }>(`select count(*)::int as n from public."${t}"`)).rows[0].n,
    }));
    const bad = compareCounts(manifest, counts);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    if (bad.length) throw new Error(`복원 행 수가 다름:\n  ${bad.join("\n  ")}`);
    // 화면 집계 함수가 복원된 데이터로 도는지
    const [{ n }] = (await db.query<{ n: number }>("select count(*)::int as n from trend_monthly(1, null, '202401', '202412')")).rows;
    console.log(`검증 통과: ${dir}\n  표 ${counts.size}개 ${total}행 복원, 행 수 모두 일치, 추이 함수 ${n}개월 (${((Date.now() - started) / 1000).toFixed(0)}초)`);
  } finally {
    await db.close();
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  if (cmd === "backup") {
    // 작업 스케줄러는 PC가 켜질 때마다 부르므로, 최근 백업이 N일 안이면 건너뛴다 (--if-older-than 6 → 사실상 주 1회)
    const days = Number(opt("if-older-than"));
    const last = listBackups().at(-1);
    if (days > 0 && last) {
      const age = (Date.now() - Date.parse(JSON.parse(readFileSync(join(BACKUP_DIR, last, "manifest.json"), "utf8")).created_at)) / 86_400_000;
      if (age < days) return console.log(`최근 백업이 ${age.toFixed(1)}일 전이라 건너뜀 (${last})`);
    }
    return backup(rest.includes("--with-raw"));
  }
  if (cmd === "verify") {
    const dir = rest[0] && !rest[0].startsWith("--") ? resolve(rest[0]) : (() => {
      const all = listBackups();
      if (!all.length) throw new Error(`백업이 없습니다: ${BACKUP_DIR}`);
      return join(BACKUP_DIR, all.at(-1)!);
    })();
    return verify(dir);
  }
  if (cmd === "restore") {
    const dir = rest[0];
    const target = opt("target");
    if (!dir || !target || !rest.includes("--yes")) throw new Error("사용법: db:restore -- <백업 폴더> --target <postgres 주소> --yes (대상의 같은 표를 모두 비웁니다)");
    if (target === process.env.SUPABASE_DB_URL && !rest.includes("--force-production")) {
      throw new Error("대상이 운영 DB(SUPABASE_DB_URL)입니다. 정말 운영을 백업으로 되돌리려면 --force-production을 더하세요");
    }
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as Manifest;
    const counts = await restore(resolve(dir), target);
    const bad = compareCounts(manifest, counts);
    if (bad.length) throw new Error(`복원 행 수가 다름:\n  ${bad.join("\n  ")}`);
    console.log(`복원 완료: 표 ${counts.size}개, 행 수 모두 일치`);
    return;
  }
  throw new Error("사용법: db-backup.ts <backup|restore|verify> (파일 맨 위 설명 참고)");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((e) => {
    console.error(String((e as Error).message ?? e));
    process.exit(1);
  });
}

// 이번 작업 검증: node e2e.mjs <base>
// 기대값은 2026-11-16 밤 DB에서 화면과 다른 SQL로 직접 계산한 값 (수집이 다시 돌면 달라질 수 있음 → 그때는 DATA=0으로 구조만 검사)
import { chromium } from "playwright";
// 설치된 Playwright 브라우저를 쓰려면 비워 두고, 다른 크로미움을 쓰려면 PW_CHROMIUM에 실행 파일 경로
const EXE = process.env.PW_CHROMIUM || undefined;
const base = process.argv[2];
const DATA = process.env.DATA !== "0";
const b = await chromium.launch({ executablePath: EXE });
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " :: " + extra}`); };

async function open(ctx, path) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 300)); });
  p.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 300)));
  const res = await p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
  return { p, errs, status: res.status(), text: async () => (await p.locator("main").innerText()).replace(/\s+/g, " ") };
}
const statOf = async (p, label) => {
  const el = p.locator("div.panel", { has: p.locator(`div.cap:text-is("${label}")`) }).first();
  return (await el.count()) ? (await el.innerText()).replace(/\s+/g, " ") : null;
};
const statLike = async (p, re) => {
  const all = await p.locator("div.panel:has(> div.cap)").allInnerTexts();
  return all.map((t) => t.replace(/\s+/g, " ")).find((t) => re.test(t)) ?? null;
};

const desk = await b.newContext({ viewport: { width: 1440, height: 900 } });

// ---- 모든 화면: 200, 콘솔 오류 없음, 가로 넘침 없음 (데스크톱·모바일) ----
const PATHS = ["/", "/?jb=all", "/new", "/new?kind=rent&d=7", "/new?d=1", "/new?d=14&g=1", "/compare", "/rank", "/rank?sort=ratio", "/rank?sort=gap&band=all",
  "/renewal", "/rent", "/rent?g=1&band=59&range=5y", "/rent?band=150&g=3", "/events", "/events/cancelled", "/events/cancelled?all=1&m=60", "/events/cancelled?n=10&nodirect=1&g=2",
  "/complex", "/supply", "/supply?g=1&w=36", "/watch"];
const mob = await b.newContext({ viewport: { width: 390, height: 844 } });
for (const [ctx, tag] of [[desk, "desk"], [mob, "mob"]]) {
  for (const path of PATHS) {
    const { p, errs, status } = await open(ctx, path);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${tag} ${path} 200·오류없음·넘침없음`, status === 200 && errs.length === 0 && overflow <= 0, `status=${status} overflow=${overflow} errs=${JSON.stringify(errs)}`);
    await p.close();
  }
}

// ---- 상단 메뉴 ----
{
  const { p } = await open(desk, "/new");
  const nav = await p.locator('nav[aria-label="주요 화면"] a').allInnerTexts();
  ok("메뉴에 새 신고·월세", nav.includes("새 신고") && nav.includes("월세"), nav.join(","));
  ok("새 신고 메뉴 활성", (await p.locator('nav[aria-label="주요 화면"] a[aria-current="page"]').innerText()) === "새 신고");
  await p.close();
  const c = await open(desk, "/events/cancelled");
  ok("해제 화면에서 메뉴는 신고가·하락 활성", (await c.p.locator('nav[aria-label="주요 화면"] a[aria-current="page"]').innerText()) === "신고가·하락");
  ok("해제 화면 탭 활성", (await c.p.locator('nav[aria-label="거래 목록 종류"] a[aria-current="page"]').innerText()) === "해제된 거래");
  await c.p.locator('nav[aria-label="거래 목록 종류"] a', { hasText: "신고가·하락" }).click();
  await c.p.waitForURL(/\/events$/);
  ok("탭으로 신고가·하락 이동", (await c.p.locator("h1").innerText()) === "신고가·하락 거래");
  await c.p.close();
  const r = await open(desk, "/rent");
  ok("월세 메뉴 활성 (전세 갱신과 안 겹침)", (await r.p.locator('nav[aria-label="주요 화면"] a[aria-current="page"]').allInnerTexts()).join() === "월세");
  await r.p.close();
  const rn = await open(desk, "/renewal");
  ok("전세 갱신 메뉴 활성", (await rn.p.locator('nav[aria-label="주요 화면"] a[aria-current="page"]').allInnerTexts()).join() === "전세 갱신");
  await rn.p.close();
}

// ---- 추이: 전세 기준 ----
{
  const { p, text } = await open(desk, "/?g=1&band=84");
  const t = await text();
  ok("추이 기본은 신규 계약 기준 안내", t.includes("전세는 신규 계약 기준(갱신 제외)"));
  const s = await statLike(p, /^전세 중위/);
  if (DATA) ok("추이 영통84 26.09 전세 중위 6.00억(갱신 제외)", /전세 중위.*6\.00억/.test(s ?? ""), s);
  ok("전세 기준 선택지 눌림 상태", (await p.locator('[role="group"][aria-label="전세 기준"] button[aria-pressed="true"]').innerText()).includes("신규 계약"));
  await p.locator('[role="group"][aria-label="전세 기준"] button', { hasText: "전체" }).click();
  await p.waitForURL(/jb=all/);
  await p.waitForFunction(() => document.querySelector("main")?.innerText.includes("갱신 포함 전체 계약 기준"));
  const s2 = await statLike(p, /^전세 중위/);
  if (DATA) ok("전체 기준으로 바꾸면 5.46억", /전세 중위.*5\.46억/.test(s2 ?? ""), s2);
  ok("전체 기준 안내", (await text()).includes("갱신 포함 전체 계약 기준"));
  // 표: 26.09 행의 전세 건수
  await p.getByText("표로 보기", { exact: true }).click();
  const row = (await p.locator("details tr", { hasText: "2026.09" }).last().innerText()).replace(/\s+/g, " ");
  if (DATA) ok("표 26.09 전세 건수 79(전체)", /5\.46억 79/.test(row), row);
  await p.close();
  const n = await open(desk, "/?g=1&band=84");
  await n.p.getByText("표로 보기", { exact: true }).click();
  const row2 = (await n.p.locator("details tr", { hasText: "2026.09" }).last().innerText()).replace(/\s+/g, " ");
  if (DATA) ok("표 26.09 전세 건수 35(신규)", /6\.00억 35/.test(row2), row2);
  await n.p.close();
}

// ---- 월세 ----
{
  const { p, text } = await open(desk, "/rent");
  if (DATA) {
    ok("월세 비중 46%", /46%/.test((await statLike(p, /^월세 비중/)) ?? ""), await statLike(p, /^월세 비중/));
    ok("전환율 5.30%", /5\.30%/.test((await statLike(p, /^전월세 전환율/)) ?? ""), await statLike(p, /^전월세 전환율/));
    ok("월세 보증금 3.00억 · 신규 135건", /3\.00억.*135건/.test((await statLike(p, /^월세 보증금 중위/)) ?? ""), await statLike(p, /^월세 보증금 중위/));
    ok("월세 중위 160만원", /160만원/.test((await statLike(p, /^월세 중위/)) ?? ""), await statLike(p, /^월세 중위/));
  }
  await p.getByText("표로 보기", { exact: true }).click();
  const row = (await p.locator("details tr", { hasText: "2026.09" }).last().innerText()).replace(/\s+/g, " ");
  if (DATA) ok("월세 표 26.09: 385 239 158 135 46% 3.00억 160만 5.30% 99", /385 239 158 135 46% 3\.00억 160만 5\.30% 99/.test(row), row);
  ok("월세 차트 2개", (await p.locator('svg[role="img"]').count()) === 2);
  ok("전환율 설명", (await text()).includes("전환율 = 월세 × 12 ÷"));
  await p.close();
}

// ---- 새 신고 ----
{
  const { p, text } = await open(desk, "/new");
  await text();
  ok("새 신고 제목", (await p.locator("h1").innerText()) === "새로 신고된 거래");
  const rows = await p.locator("tbody tr:not(.bg-surface-2)").count();
  const stat = await statLike(p, /^새 매매/);
  const n = Number(stat?.match(/새 매매 (\d+)/)?.[1]);
  ok("새 매매 건수 = 표 행 수", n === rows && rows > 0, `${stat} rows=${rows}`);
  const heads = await p.locator("tbody tr.bg-surface-2").allInnerTexts();
  const sum = heads.reduce((s, h) => s + Number(h.match(/매매 (\d+)건/)?.[1] ?? 0), 0);
  ok("수집일 묶음 건수 합 = 전체", sum === rows, `${heads.join("|")} sum=${sum}`);
  ok("수집일 머리글은 최근 날짜부터", heads.map((h) => h.match(/(\d+)월 (\d+)일/).slice(1).map(Number)).every((d, i, a) => i === 0 || a[i - 1][0] * 100 + a[i - 1][1] > d[0] * 100 + d[1]), heads.join("|"));
  const badges = await p.locator("tbody tr:not(.line-through) span.rounded", { hasText: "▲ 신고가" }).count();
  const hs = await statLike(p, /^신고가 \/ 하락/);
  ok("신고가 수 = 배지 수(해제 제외)", Number(hs?.match(/신고가 \/ 하락 (\d+)/)?.[1]) === badges, `${hs} badges=${badges}`);
  if (DATA) ok("최근 3일 매매 53건·해제 5건·신고가 15", /새 매매 53건 해제 5건 포함/.test(stat ?? "") && /신고가 \/ 하락 15/.test(hs ?? ""), `${stat} | ${hs}`);
  // 종류 바꾸기
  await p.locator("select").first().selectOption("rent");
  await p.waitForURL(/kind=rent/);
  await p.waitForFunction(() => document.querySelector("main")?.innerText.includes("새 전월세"));
  const rs = await statLike(p, /^새 전월세/);
  const rrows = await p.locator("tbody tr:not(.bg-surface-2)").count();
  ok("전월세로 바꾸면 건수 = 표 행 수", Number(rs?.match(/새 전월세 (\d+)/)?.[1]) === rrows && rrows > 0, `${rs} rows=${rrows}`);
  if (DATA) ok("최근 3일 전월세 102건", /새 전월세 102건/.test(rs ?? ""), rs);
  await p.close();
  const e = await open(desk, "/new?d=999&kind=zzz&g=abc");
  ok("잘못된 파라미터는 기본값", e.status === 200 && (await e.text()).includes("새 매매"));
  await e.p.close();
  const d1 = await open(desk, "/new?d=1&g=4");
  ok("오늘 수집분·강동", d1.status === 200 && /새 매매 \d+건/.test(await d1.text()));
  await d1.p.close();
}

// ---- 해제된 거래 ----
{
  const { p } = await open(desk, "/events/cancelled");
  const a = await statLike(p, /^해제된 매매/), h = await statLike(p, /^그중 계약 당시 신고가/);
  const rows = await p.locator("tbody tr").count();
  ok("신고가 해제 건수 = 표 행 수", Number(h?.match(/신고가 (\d+)건/)?.[1]) === rows, `${h} rows=${rows}`);
  ok("모든 행에 신고가였음 배지", (await p.locator("tbody span.rounded", { hasText: "신고가였음" }).count()) === rows);
  if (DATA) ok("최근 1년 해제 513건, 신고가 157건", /513건/.test(a ?? "") && /157건/.test(h ?? ""), `${a} | ${h}`);
  // 모든 행: 거래가 > 직전 최고가, 대비 +
  const bad = await p.locator("tbody tr").evaluateAll((trs) => trs.filter((tr) => {
    const td = [...tr.querySelectorAll("td")].map((x) => x.innerText);
    return !(parseFloat(td[5]) > parseFloat(td[6])) && !td[7].startsWith("+");
  }).length);
  ok("신고가 해제 행은 모두 직전 최고가 초과", bad === 0, `bad=${bad}`);
  await p.locator("label", { hasText: "신고가가 아닌 해제도 표시" }).locator("input").check();
  await p.waitForURL(/all=1/);
  await p.waitForFunction((n) => document.querySelectorAll("tbody tr").length > n, rows);
  const allRows = await p.locator("tbody tr").count();
  ok("전체 해제 표시 = 해제된 매매 건수", allRows === Number(a?.match(/(\d+)건/)?.[1]), `rows=${allRows} ${a}`);
  await p.close();
  const g = await open(desk, "/events/cancelled?m=3&n=3");
  const dates = await g.p.locator("tbody tr td:first-child").allInnerTexts();
  ok("해제일 내림차순", dates.every((d, i) => i === 0 || dates[i - 1] >= d), dates.slice(0, 5).join());
  const counts = await g.p.locator("tbody tr td:nth-child(7)").allInnerTexts();
  ok("비교 거래 3건 이상만", counts.every((c) => Number(c.match(/(\d+)건/)?.[1]) >= 3), counts.slice(0, 5).join());
  await g.p.close();
}

// ---- 순위: 전세가율·갭 ----
{
  const { p } = await open(desk, "/rank?sort=ratio&band=84");
  const head = await p.locator("thead th").allInnerTexts();
  ok("순위 표 머리글에 전세 중위·전세가율·갭", ["전세 중위", "전세가율", "갭"].every((x) => head.includes(x)), head.join(","));
  const ratios = (await p.locator("tbody tr td:nth-child(8)").allInnerTexts()).map((x) => (x === "-" ? null : Number(x.replace("%", ""))));
  ok("전세가율 높은 순 정렬 (없는 값은 끝)", ratios.every((r, i) => i === 0 || r == null || (ratios[i - 1] != null && ratios[i - 1] >= r)), ratios.slice(0, 8).join());
  const first = (await p.locator("tbody tr").first().innerText()).replace(/\s+/g, " ");
  if (DATA) ok("1위 극동의푸른별 4.60억/4.30억/93%/0.30억", /극동의푸른별.*4\.60억 4\.30억 93% 0\.30억/.test(first), first);
  // 행마다 전세가율·갭이 매매·전세 중위와 맞는지
  const bad = await p.locator("tbody tr").evaluateAll((trs) => trs.filter((tr) => {
    const td = [...tr.querySelectorAll("td")].map((x) => x.innerText);
    const trade = parseFloat(td[5]), jeonse = td[6] === "-" ? null : parseFloat(td[6]);
    if (jeonse == null) return td[7] !== "-" || td[8] !== "-";
    return Math.abs(parseFloat(td[7]) - (jeonse / trade) * 100) > 1.5 || Math.abs(parseFloat(td[8]) - (trade - jeonse)) > 0.011;
  }).length);
  ok("모든 행의 전세가율·갭이 표시된 매매·전세 중위와 일치", bad === 0, `bad=${bad}`);
  await p.close();
  const g = await open(desk, "/rank?sort=gap&band=84");
  const gaps = (await g.p.locator("tbody tr td:nth-child(9)").allInnerTexts()).map((x) => (x === "-" ? null : parseFloat(x)));
  ok("갭 작은 순 정렬", gaps.every((r, i) => i === 0 || r == null || (gaps[i - 1] != null && gaps[i - 1] <= r)), gaps.slice(0, 8).join());
  await g.p.close();
  const all = await open(desk, "/rank?band=all");
  ok("전체 면적일 때 주의 문구", (await all.text()).includes("면적 구성이 달라"));
  await all.p.close();
}

// ---- 입주 물량 ----
{
  const { p, text } = await open(desk, "/supply");
  const t = await text();
  ok("입주: 전세는 신규 계약 안내", t.includes("갱신 제외 신규 계약"));
  ok("입주: 직접 입력 안내", t.includes("manual_supply"));
  const title = await p.locator("h2", { hasText: /^공고 \d+건/ }).innerText();
  const rows = await p.locator("section:has(h2:text-matches('^공고')) tbody tr").count();
  ok("공고 건수 = 목록 행 수", Number(title.match(/공고 (\d+)건/)[1]) === rows, `${title} rows=${rows}`);
  ok("직접 입력이 없으면 이주 카드 없음", !t.includes("향후 12개월 이주"));
  await p.close();
}

// ---- 단지·단지 비교·관심 단지 ----
{
  const { p } = await open(desk, "/rank?band=84&sort=vol");
  const href = await p.locator("tbody tr a[href^='/complex/']").first().getAttribute("href");
  const seq = decodeURIComponent(href.split("/").pop());
  await p.close();
  const c = await open(desk, href);
  const st = await statOf(c.p, "최근 3개월 전세 중위");
  ok("단지: 전세 중위 카드에 신규 건수", c.status === 200 && (st?.includes("신규") || st?.includes("-")), st);
  ok("단지: 범례에 전세 갱신", (await c.text()).includes("전세 갱신"));
  ok("단지 콘솔 오류 없음", c.errs.length === 0, JSON.stringify(c.errs));
  await c.p.close();
  const cmp = await open(desk, `/complex/compare?ids=${encodeURIComponent(seq)}&metric=jeonse`);
  ok("단지 비교(전세): 갱신 제외 안내", cmp.status === 200 && (await cmp.text()).includes("갱신 계약 제외"), "");
  await cmp.p.close();
  const fav = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await fav.addCookies([{ name: "bds_fav", value: encodeURIComponent(seq), url: base }]);
  const w = await open(fav, "/watch");
  const wt = await w.text();
  ok("관심 단지: 갱신 제외 안내·행 표시", w.status === 200 && wt.includes("전세는 갱신 계약 제외") && (await w.p.locator("tbody tr").count()) === 1, wt.slice(0, 200));
  ok("관심 단지 콘솔 오류 없음", w.errs.length === 0, JSON.stringify(w.errs));
  await w.p.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);

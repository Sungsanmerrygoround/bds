// 관심 단지의 새 거래 검증: node fav.mjs <base>
import { chromium } from "playwright";
// 설치된 Playwright 브라우저를 쓰려면 비워 두고, 다른 크로미움을 쓰려면 PW_CHROMIUM에 실행 파일 경로
const EXE = process.env.PW_CHROMIUM || undefined;
const base = process.argv[2];
const b = await chromium.launch({ executablePath: EXE });
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) pass++; else fail++; console.log(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " :: " + extra}`); };
const errs = [];
const page = async (ctx, path) => {
  const p = await ctx.newPage();
  p.on("console", (m) => { if (m.type() === "error") errs.push(path + " " + m.text().slice(0, 200)); });
  p.on("pageerror", (e) => errs.push(path + " PAGEERROR " + e.message.slice(0, 200)));
  const res = await p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
  return { p, status: res.status() };
};
const rowCount = (p) => p.locator("tbody tr:not(.bg-surface-2):has(td:nth-child(3))").count();
const names = async (p) => [...new Set(await p.locator("tbody tr td:nth-child(2) a").allInnerTexts())];

// 1) 관심 단지 없음
const empty = await b.newContext({ viewport: { width: 1440, height: 900 } });
{
  const { p, status } = await page(empty, "/new?fav=1&d=14");
  const t = await p.locator("main").innerText();
  ok("관심 단지 없이 fav=1: 안내 문구", status === 200 && t.includes("아직 관심 단지가 없습니다") && t.includes("관심 단지만 (0개)"), t.slice(0, 300));
  ok("관심 단지 없이 fav=1: 새 매매 0건", /새 매매\s*0건/.test(t.replace(/\n/g, "")), "");
  await p.close();
}

// 2) 전체 목록에서 단지 두 개를 골라 ★ 누르기 → 쿠키 저장 → 관심 단지만
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
{
  const { p } = await page(ctx, "/new?d=14");
  const total = await rowCount(p);
  const first = p.locator("tbody tr:has(td:nth-child(3))").first();
  const name1 = await first.locator("td:nth-child(2) a").innerText();
  await first.locator("button[aria-pressed]").click();
  await p.waitForFunction(() => document.querySelector("main")?.innerText.includes("관심 단지만 (1개)"), null, { timeout: 20000 });
  ok("목록에서 ★ 누르면 관심 단지 1개", true);
  const hint = await p.locator("p.text-warn").innerText();
  const same = await p.locator("tbody tr:has(td:nth-child(3))", { has: p.locator(`td:nth-child(2) a:text-is("${name1}")`) }).count();
  ok("관심 단지 거래 수 안내 = 그 단지의 행 수", Number(hint.match(/(\d+)건/)?.[1]) === same, `${hint} same=${same}`);
  const pressed = await p.locator('tbody button[aria-pressed="true"]').count();
  ok("그 단지의 모든 행에 채워진 ★", pressed === same, `pressed=${pressed} same=${same}`);

  await p.locator("label", { hasText: "관심 단지만" }).locator("input").check();
  await p.waitForURL(/fav=1/);
  await p.waitForFunction((n) => document.querySelectorAll("tbody tr td:nth-child(3)").length === n, same, { timeout: 20000 });
  const filtered = await rowCount(p);
  ok("관심 단지만: 그 단지 거래만 남음", filtered === same && filtered < total && (await names(p)).join() === name1, `filtered=${filtered} same=${same} total=${total} names=${(await names(p)).join()}`);
  const stat = (await p.locator("div.panel:has(> div.cap)").first().innerText()).replace(/\s+/g, " ");
  ok("요약 카드도 관심 단지 기준", new RegExp(`새 매매 ${same}건`).test(stat), stat);

  // 전월세로 바꿔도 필터 유지
  await p.locator("select").first().selectOption("rent");
  await p.waitForURL(/kind=rent/);
  await p.waitForFunction(() => document.querySelector("main")?.innerText.includes("새 전월세"));
  ok("전월세로 바꿔도 fav 유지", /fav=1/.test(p.url()));
  const rn = await names(p);
  ok("전월세도 관심 단지만 (또는 없음)", rn.length === 0 || rn.join() === name1, rn.join());

  // 관심 단지 화면의 바로가기
  const w = await page(ctx, "/watch");
  const link = w.p.locator("a", { hasText: "새로 신고된 거래 보기" });
  ok("관심 단지 화면에 새 신고 바로가기", (await link.getAttribute("href")) === "/new?fav=1&d=14");
  await link.click();
  await w.p.waitForURL(/\/new\?fav=1/);
  ok("바로가기 → 관심 단지만 켜진 새 신고", await w.p.locator("label", { hasText: "관심 단지만" }).locator("input").isChecked());
  await w.p.close();

  // 해제하면 목록에서 빠진다
  const f = await page(ctx, "/new?fav=1&d=14");
  await f.p.locator('tbody button[aria-pressed="true"]').first().click();
  await f.p.waitForFunction(() => document.querySelector("main")?.innerText.includes("아직 관심 단지가 없습니다"), null, { timeout: 20000 });
  ok("★ 해제하면 관심 단지 없음 안내", true);
  await f.p.close();
  await p.close();
}

// 3) 모바일 넘침·오류
const mob = await b.newContext({ viewport: { width: 390, height: 844 } });
await mob.addCookies([{ name: "bds_fav", value: "41117-337", url: base }]);
for (const path of ["/new?fav=1&d=30", "/new?fav=1&kind=rent&d=30", "/new", "/watch"]) {
  const { p, status } = await page(mob, path);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`mob ${path}`, status === 200 && overflow <= 0, `status=${status} overflow=${overflow}`);
  await p.close();
}
ok("콘솔 오류 없음", errs.length === 0, JSON.stringify(errs));
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);

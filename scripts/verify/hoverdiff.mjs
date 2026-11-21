// 차트 위 여러 지점에 마우스를 올려 나오는 값(읽음 줄·툴팁)을 운영과 로컬에서 비교한다.
// node hoverdiff.mjs <local base>
import { chromium } from "playwright";
// 설치된 Playwright 브라우저를 쓰려면 비워 두고, 다른 크로미움을 쓰려면 PW_CHROMIUM에 실행 파일 경로
const EXE = process.env.PW_CHROMIUM || undefined;
const PROD = "https://bds-black.vercel.app";
const LOCAL = process.argv[2];
const PAGES = ["/", "/?g=3&band=59&range=5y", "/compare", "/compare?view=index", "/renewal", "/rent", "/rent?g=2&band=all", "/supply", "/supply?g=4&w=36",
  "/complex/41117-337?range=2y", "/complex/compare?ids=41117-337,11740-25&metric=jeonse"];
const STEPS = 9;

const b = await chromium.launch({ executablePath: EXE });
async function sample(base, path) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
  await p.evaluate(() => document.fonts.ready);
  const out = [];
  // 직접 그린 SVG 차트(role=img)와 recharts 차트
  const targets = await p.locator('main svg[role="img"], main .recharts-wrapper').all();
  for (const [ti, t] of targets.entries()) {
    await t.scrollIntoViewIfNeeded();
    const box = await t.boundingBox();
    if (!box) continue;
    for (let s = 0; s < STEPS; s++) {
      const x = box.x + 20 + ((box.width - 40) * s) / (STEPS - 1);
      await p.mouse.move(x, box.y + box.height / 2);
      await p.waitForTimeout(60);
      const tip = await p.locator(".recharts-tooltip-wrapper").evaluateAll((els) => els.map((e) => e.innerText).join("|"));
      out.push(`#${ti}@${s}: ${(await p.locator("main").innerText()).length} ${tip}`);
      // 읽음 줄은 차트 패널 안 텍스트 전체로 비교
      out.push(await t.evaluate((el) => (el.closest("section") ?? el.parentElement).innerText));
    }
  }
  await ctx.close();
  return out;
}
let diff = 0;
for (const path of PAGES) {
  const [a, c] = await Promise.all([sample(PROD, path), sample(LOCAL, path)]);
  const bad = a.map((x, i) => (x === c[i] ? null : i)).filter((i) => i != null);
  const ok = a.length === c.length && bad.length === 0;
  if (!ok) diff++;
  console.log(`${ok ? "SAME" : "DIFF"} ${path.padEnd(48)} 표본 ${a.length / 2}곳${ok ? "" : ` 다른 곳 ${bad.length}`}`);
  for (const i of bad.slice(0, 3)) console.log("   prod :", a[i]?.slice(0, 200).replace(/\n/g, " ⏎ "), "\n   local:", c[i]?.slice(0, 200).replace(/\n/g, " ⏎ "));
}
console.log(diff ? `${diff}개 화면 다름` : "모든 화면 같음");
await b.close();

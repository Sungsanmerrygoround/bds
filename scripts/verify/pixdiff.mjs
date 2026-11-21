// 운영(기준)과 로컬(비교 대상)을 같은 순간에 같은 DB로 렌더해 화면을 픽셀·글자 단위로 비교한다.
// node pixdiff.mjs <local base> [--only 이름,이름]
// 리팩터링이 동작을 바꾸지 않았다면 모든 화면이 0픽셀 차이여야 한다.
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "node:fs";

// 설치된 Playwright 브라우저를 쓰려면 비워 두고, 다른 크로미움을 쓰려면 PW_CHROMIUM에 실행 파일 경로
const EXE = process.env.PW_CHROMIUM || undefined;
const PROD = "https://bds-black.vercel.app";
const LOCAL = process.argv[2];
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
const FAV = "41117-337,11740-25,41131-1652";

const ROUTES = [
  ["trend", "/"], ["trend-g2-59", "/?g=2&band=59"], ["trend-all-5y", "/?jb=all&range=5y"], ["trend-g4-6m", "/?g=4&band=all&range=6m"],
  ["trend-custom", "/?from=202301&to=202406&g=3"],
  ["compare", "/compare"], ["compare-index", "/compare?view=index&band=all"], ["compare-1y", "/compare?range=1y&band=59"],
  ["rank", "/rank"], ["rank-ratio", "/rank?sort=ratio"], ["rank-gap", "/rank?sort=gap&g=3&hh=500"], ["rank-chg", "/rank?sort=chg&band=all&min=10"],
  ["rank-peak", "/rank?sort=peak&band=125&min=1"],
  ["renewal", "/renewal"], ["renewal-g2", "/renewal?g=2&band=59&range=5y"],
  ["rent", "/rent"], ["rent-g1", "/rent?g=1&band=59&range=1y"], ["rent-150", "/rent?band=150&g=3"],
  ["events", "/events"], ["events-drop", "/events?type=DROP&m=12&n=3&nodirect=1"], ["events-invalid", "/events?invalid=1&m=1&type=NEW_HIGH"],
  ["cancel", "/events/cancelled"], ["cancel-all", "/events/cancelled?all=1&m=3"], ["cancel-n10", "/events/cancelled?n=10&g=2&m=60&nodirect=1"],
  ["new", "/new"], ["new-rent", "/new?kind=rent&d=7"], ["new-d1", "/new?d=1&g=4"], ["new-30", "/new?d=30&g=2"],
  ["complex", "/complex"], ["complex-q", "/complex?q=%EC%9E%90%EC%9D%B4"], ["complex-g2", "/complex?g=2"],
  ["cx-337", "/complex/41117-337"], ["cx-337-all", "/complex/41117-337?area=all&range=5y"], ["cx-25", "/complex/11740-25?range=1y"],
  ["cx-404", "/complex/zzzz-1"],
  ["ccmp-jeonse", "/complex/compare?ids=41117-337,11740-25&metric=jeonse"], ["ccmp-index", "/complex/compare?ids=41117-337,11740-25&view=index&band=all"],
  ["ccmp-empty", "/complex/compare"], ["ccmp-q", "/complex/compare?ids=41117-337&q=%EC%95%84%EC%9D%B4%ED%8C%8C%ED%81%AC"],
  ["supply", "/supply"], ["supply-g1", "/supply?g=1&w=36&excluded=1"], ["supply-0", "/supply?w=0&g=4"],
  ["watch", "/watch"],
  ["fav-watch", "/watch", true], ["fav-new", "/new?fav=1&d=30", true], ["fav-new-rent", "/new?fav=1&d=30&kind=rent", true], ["fav-rank", "/rank", true],
  ["fav-ccmp", "/complex/compare?ids=41117-337", true],
].filter(([name]) => !only || only.has(name));

const VIEWPORTS = [["d", { width: 1440, height: 900 }], ["m", { width: 390, height: 844 }]];
fs.mkdirSync("pix", { recursive: true });
const b = await chromium.launch({ executablePath: EXE });

async function capture(ctx, url) {
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) errs.push(m.text().slice(0, 200)); });
  const res = await p.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await p.evaluate(() => document.fonts.ready);
  if (process.argv.includes("--merge-text")) {
    // 텍스트 노드 쪼개짐(React의 <!-- --> 구분)만 다른 경우를 가려내기 위해 양쪽 모두 주석을 지우고 인접 텍스트 노드를 합친다
    await p.evaluate(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
      const cs = [];
      while (w.nextNode()) cs.push(w.currentNode);
      cs.forEach((c) => c.remove());
      document.body.normalize();
    });
  }
  await p.waitForTimeout(500);
  // 상단 수집 시각은 같은 DB라 같지만, 혹시 모를 시계 차이를 막기 위해 그대로 둔다(같아야 정상)
  const png = PNG.sync.read(await p.screenshot({ fullPage: true }));
  const text = await p.evaluate(() => document.body.innerText);
  await p.close();
  return { status: res.status(), png, text, errs };
}

let same = 0, diff = 0;
const report = [];
for (const [vname, viewport] of VIEWPORTS) {
  const ctxs = {};
  for (const fav of [false, true]) {
    for (const side of ["prod", "local"]) {
      const c = await b.newContext({ viewport, deviceScaleFactor: 1 });
      if (fav) await c.addCookies([{ name: "bds_fav", value: encodeURIComponent(FAV), url: side === "prod" ? PROD : LOCAL }]);
      ctxs[`${side}${fav ? "-fav" : ""}`] = c;
    }
  }
  for (const [name, path, fav] of ROUTES) {
    const sfx = fav ? "-fav" : "";
    const [a, c] = await Promise.all([capture(ctxs[`prod${sfx}`], PROD + path), capture(ctxs[`local${sfx}`], LOCAL + path)]);
    let px = null;
    if (a.png.width === c.png.width && a.png.height === c.png.height) {
      const out = new PNG({ width: a.png.width, height: a.png.height });
      px = pixelmatch(a.png.data, c.png.data, out.data, a.png.width, a.png.height, { threshold: 0 });
      if (px > 0) fs.writeFileSync(`pix/${name}-${vname}-diff.png`, PNG.sync.write(out));
    }
    const textSame = a.text === c.text;
    const ok = px === 0 && textSame && a.status === c.status && c.errs.length === 0;
    if (ok) same++; else diff++;
    const line = `${ok ? "SAME" : "DIFF"} ${vname} ${name.padEnd(14)} status ${a.status}/${c.status} size ${a.png.width}x${a.png.height}/${c.png.width}x${c.png.height} px=${px ?? "크기 다름"} text=${textSame ? "같음" : "다름"}${c.errs.length ? " errs=" + JSON.stringify(c.errs) : ""}`;
    console.log(line);
    if (!ok) {
      fs.writeFileSync(`pix/${name}-${vname}-prod.png`, PNG.sync.write(a.png));
      fs.writeFileSync(`pix/${name}-${vname}-local.png`, PNG.sync.write(c.png));
      if (!textSame) {
        const la = a.text.split("\n"), lc = c.text.split("\n");
        const onlyA = la.filter((l) => !lc.includes(l)).slice(0, 6), onlyC = lc.filter((l) => !la.includes(l)).slice(0, 6);
        for (const l of onlyA) console.log("    - " + l.slice(0, 150));
        for (const l of onlyC) console.log("    + " + l.slice(0, 150));
      }
    }
    report.push(line);
  }
  for (const c of Object.values(ctxs)) await c.close();
}
console.log(`\n${same} same, ${diff} diff (화면 ${ROUTES.length}개 × 데스크톱·모바일)`);
await b.close();
process.exit(diff ? 1 : 0);

// 수집 실행 진입점
//   npm run ingest -- backfill                  최근 36개월 매매·전월세 (이벤트 판단 안 함 = 기준선)
//   npm run ingest -- daily                     최근 3개월 재수집 + 신고가·하락 판단
//   npm run ingest -- supply                    청약홈 입주 물량
//   npm run ingest -- refresh                   3~8개월 전 매매 재수집 (나중에 채워지는 등기일·해제 반영, 이벤트 판단 안 함)
//   npm run ingest -- rates                     한국은행 기준금리·주담대 금리 (2021-10~, 월별)
//   npm run ingest -- index                     부동산원 주간 매매·전세 지수 (2021-09~ 전체 재수집, 발표 후 정정 반영)
//   npm run ingest -- kapt                      K-apt 단지 기본정보(세대수·동수·주차 등): 없는·오래된 단지만 받아 캐시 → 짝짓기 (--dry: 저장 없이 결과만)
// 옵션: --lawd 41117,41131  --from 202607 --to 202607  --kind trade|rent  --dry(DB 없이 결과만 출력)

import "./env";
import { parseArgs } from "./args";
import { runDeals, runDry } from "./jobs/deals";
import { runKapt } from "./jobs/kapt";
import { runRates } from "./jobs/rates";
import { runSupply } from "./jobs/supply";
import { runIndex } from "./jobs/weekly-index";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.job === "rates") return runRates(args);
  if (args.job === "kapt") return runKapt(args);
  if (args.job === "index") return runIndex(args);
  if (args.job === "supply") return runSupply(args);
  if (args.dry) return runDry(args);
  return runDeals(args);
}

main().catch((e) => {
  console.error(e);
  // GitHub Actions: 실행 요약 화면에 오류 메시지를 주석으로 표시
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${String((e as Error).message ?? e).replace(/\r?\n/g, " ")}`);
  process.exit(1);
});

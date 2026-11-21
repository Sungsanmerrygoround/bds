// 수집 실행 진입점
//   npm run ingest -- backfill                  최근 36개월 매매·전월세 (이벤트 판단 안 함 = 기준선)
//   npm run ingest -- daily                     최근 3개월 재수집 + 신고가·하락 판단
//   npm run ingest -- supply                    청약홈 입주 물량
//   npm run ingest -- refresh                   3~8개월 전 매매 재수집 (나중에 채워지는 등기일·해제 반영, 이벤트 판단 안 함)
//   npm run ingest -- rates                     한국은행 기준금리·주담대 금리 (2021-10~, 월별)
//   npm run ingest -- index                     부동산원 주간 매매·전세 지수 (2021-09~ 전체 재수집, 발표 후 정정 반영)
//   npm run ingest -- check                     수집 결과 점검(성공했는데 데이터가 이상한지): 거래 수 급감·응답에서 대량으로 사라짐·지수/금리 정체 → 경고만 (실패·메일 없음)
//   npm run ingest -- kapt                      K-apt 단지 기본정보(세대수·동수·주차 등): 없는·오래된 단지만 받아 캐시 → 짝짓기 (--dry: 저장 없이 결과만)
// 옵션: --lawd 41117,41131  --from 202607 --to 202607  --kind trade|rent  --dry(DB 없이 결과만 출력)

import "./env";
import { parseArgs, type Args } from "./args";
import { serviceClient } from "./db";
import { closeStuckRuns, revalidateDashboard } from "./finish";
import { runCheck } from "./jobs/check";
import { runDeals, runDry } from "./jobs/deals";
import { runKapt } from "./jobs/kapt";
import { runRates } from "./jobs/rates";
import { runSupply } from "./jobs/supply";
import { runIndex } from "./jobs/weekly-index";
import { annotateError } from "./runlog";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.job === "check") return runCheck(); // 읽기만 하므로 기록 정리·캐시 비우기 없음
  if (args.dry) return runJob(args);
  const closed = await closeStuckRuns(serviceClient());
  if (closed > 0) console.log(`running으로 남은 이전 수집 기록 ${closed}건을 닫음`);
  try {
    await runJob(args);
  } finally {
    // 일부만 저장하고 실패했어도 저장된 만큼은 화면에 보이게
    await revalidateDashboard();
  }
}

async function runJob(args: Args) {
  if (args.job === "rates") return runRates(args);
  if (args.job === "kapt") return runKapt(args);
  if (args.job === "index") return runIndex(args);
  if (args.job === "supply") return runSupply(args);
  if (args.dry) return runDry(args);
  return runDeals(args);
}

main().catch((e) => {
  console.error(e);
  annotateError(String((e as Error).message ?? e));
  process.exit(1);
});

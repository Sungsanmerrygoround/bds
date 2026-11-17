# BDS — 아파트 실거래·입주물량 대시보드

관심 지역(영통, 평촌·범계, 구성남, 강동)의 국토부 매매·전월세 실거래와 청약홈 입주 물량을 Supabase에 모아 보여 준다.
보조 데이터: 한국은행 금리(ECOS), 한국부동산원 주간 매매·전세 지수(R-ONE), 공동주택 단지 기본정보(K-apt).

- `ingest/` 수집 스크립트 (`npm run ingest -- backfill | daily | supply | refresh | rates | index | kapt`)
  - `run.ts` 진입점(인자는 `args.ts`), 작업별 실행은 `jobs/`, API별 호출·응답 파싱은 `molit.ts`·`applyhome.ts`·`ecos.ts`·`reb.ts`·`kapt.ts`
- `supabase/migrations/` 스키마·집계 함수 (`npm run db:push`로 적용)
- `app/` 대시보드 (Next.js, 인증 없음. DB 키는 서버에서만 사용)
  - `/` 추이(+전고점 대비, 부동산원 주간 지수, 금리) · `/compare` 지역 비교(+전고점 대비, 주간 매매지수) · `/rank` 단지 순위(세대수·회전율·전세가율·갭) · `/renewal` 전세 갱신(+금리)
  - `/new` 새로 신고된 거래(수집에서 처음 본 날 기준, 직전 거래 대비. `?fav=1`은 관심 단지만 — 알림 대신 이 주소를 즐겨찾기) · `/rent` 월세(월세 비중, 전월세 전환율)
  - `/events` 신고가·하락(미등기 표시) · `/events/cancelled` 해제된 거래(계약 당시 신고가였던 해제) · `/complex` 단지(`/complex/compare` 단지 비교) · `/supply` 입주 물량(+입주 전후 전세, 직접 입력한 입주·이주)
  - `/watch` 관심 단지: ★로 저장, 로그인 없이 브라우저 쿠키(`bds_fav`)에 기기별로 보관
  - 넓은 화면은 왼쪽 필터 레일, 좁은 화면(1024px 미만)은 요약 칩 + 바텀시트
- `lib/` 순수 로직(기간·면적 구간·차트 경로·순위 지표)과 서버 전용 DB 조회(`queries.ts`)
  - 화면 공통 부품은 `app/_components/ui.tsx`(단지 링크·빈 행·표로 보기 등), 입력칸·버튼 모양은 `styles.ts`

## 집계 기준

- 전세 중위가는 **갱신 계약을 뺀 값**이 기본이다(추이·순위·관심 단지·단지·단지 비교·입주 전후 전세). 갱신은 종전 보증금에 묶여 지금 시세보다
  낮게 찍히고, 최근에는 전세 계약의 절반쯤이 갱신이다. 계약 구분이 없는 행(구분 신고 이전 등)은 신규로 본다. 추이 화면에서 `전세 기준 → 전체`로
  갱신 포함 값을 볼 수 있다.
- 전월세 전환율 = 월세 × 12 ÷ (기준 전세 − 월세 보증금). 기준 전세는 같은 단지·같은 전용면적의 계약일 전후 90일 전세(갱신 제외) 중위.
- '새로 신고된 거래'는 `first_seen_at`(수집에서 처음 본 시각) 기준이다. 5년치를 한꺼번에 받은 2026-09-28 이전은 새 신고로 보지 않는다.

## 입주 물량 직접 입력

청약홈 공고에 안 잡히는 입주(재건축 조합원분 등)와 재건축·재개발 이주는 `manual_supply` 표에 직접 넣는다(Supabase SQL Editor).
`kind`가 `입주`면 입주 세대 합계와 차트에 더해지고, `이주`면 차트에서 0 아래 막대로 따로 나온다(전세 수요). 둘 다 입주 물량 목록에 '직접 입력'으로 표시된다.

```sql
-- region_id는 regions 표의 id (select id, sigungu_name from regions)
insert into manual_supply (region_id, name, ym, households, kind, note)
values (1, '○○주공 재건축 이주', '202705', 1200, '이주', '관리처분 인가 기준');
```

## 데이터 범위와 용량

송파는 2026-10-11 DB 용량 때문에 뺐다(전월세 행의 1/3). 다시 넣는 방법은 `supabase/migrations/20261011000015_drop_songpa.sql` 주석 참고.
DB가 다시 한도에 가까워지면 거래 행의 원본 응답(`raw`, 약 130MB, 화면에서 안 씀)을 비우는 것이 다음 순서.

매매·전월세는 2021년 10월부터 5년치를 보관한다(Supabase 무료 한도 500MB 안). 과거 달을 더 받으려면
`npm run ingest -- backfill --from YYYYMM --to YYYYMM`. 새로 받는 거래는 원본 응답(`raw`)을 저장하지 않는다.

## 배포

https://bds-black.vercel.app — Vercel(`hj20/bds`, 함수 지역 서울 `icn1`). `main`에 push하면 자동 배포된다.
Vercel 환경변수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## 로컬 실행

1. `.env.example`을 `.env.local`로 복사하고 값을 채운다.
2. `npm ci` → `npm run dev` → http://localhost:3000
3. 점검: `npx tsx scripts/check-db.ts`, 테스트: `npm test`

## 자동 수집 (GitHub Actions)

`.github/workflows/ingest.yml`이 실행하는 작업:

| 언제 (KST) | 작업 |
|---|---|
| 매일 07:10 | `daily` 실거래 최근 3개월 + 신고가·하락 판단, `index` 부동산원 주간 지수(목요일 발표) |
| 월요일 07:40 | `supply` 입주 물량, `refresh` 3~8개월 전 매매 재수집(등기일 반영), `rates` 금리, `kapt` K-apt 단지 기본정보 |

저장소 Settings → Secrets and variables → Actions에 다음을 등록해야 한다.

| 이름 | 값 |
|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 인증키 (Decoding) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 |
| `ECOS_API_KEY` | 한국은행 ECOS 인증키 (`rates`) |
| `REB_API_KEY` | 한국부동산원 R-ONE 인증키 (`index`) |

`SUPABASE_DB_URL`은 마이그레이션용이라 등록하지 않는다. Actions 탭에서 `ingest` → Run workflow로 수동 실행할 수 있다.


## 단지 기본정보 짝짓기 (K-apt)

K-apt 단지마다 받은 정보를 `kapt_complexes`에 바로 저장하고(없는 단지·60일 지난 단지만 다시 받음), 이 캐시로
실거래 단지(`apt_seq`)와 K-apt 단지를 같은 법정동 + 지번 → 같은 법정동 안 이름 순으로 짝지어 `complex_info`에 쓴다(`ingest/kapt.ts`).
K-apt API는 가끔 수십 번 호출 뒤 한동안 오류(04)를 내는데, 그러면 받기를 멈추고 다음 실행이 이어 받는다.
K-apt는 의무관리 대상(대략 150세대 이상)만 있어 소규모 단지는 짝이 없다. `npm run ingest -- kapt --dry`로 매칭률과
짝 없는 단지(최근 거래 많은 순)를 볼 수 있고, 틀리거나 못 찾은 단지는 `complex_kapt_override`에 직접 넣는다
(`kapt_code`가 null이면 짝 없음으로 확정).

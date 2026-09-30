# BDS — 아파트 실거래·입주물량 대시보드

관심 지역(영통, 평촌·범계, 구성남, 강동, 송파)의 국토부 매매·전월세 실거래와 청약홈 입주 물량을 Supabase에 모아 보여 준다.

- `ingest/` 수집 스크립트 (`npm run ingest -- backfill | daily | supply | refresh`)
- `supabase/migrations/` 스키마·집계 함수 (`npm run db:push`로 적용)
- `app/` 대시보드 (Next.js, 인증 없음. DB 키는 서버에서만 사용)
  - `/` 추이(+전고점 대비) · `/compare` 지역 비교(+전고점 대비) · `/rank` 단지 순위 · `/renewal` 전세 갱신
  - `/events` 신고가·하락(미등기 표시) · `/complex` 단지(`/complex/compare` 단지 비교) · `/supply` 입주 물량(+입주 전후 전세)
  - `/watch` 관심 단지: ★로 저장, 로그인 없이 브라우저 쿠키(`bds_fav`)에 기기별로 보관
  - 넓은 화면은 왼쪽 필터 레일, 좁은 화면(1024px 미만)은 요약 칩 + 바텀시트
- `lib/` 순수 로직(기간·면적 구간·차트 경로)과 서버 전용 DB 조회(`queries.ts`)

## 데이터 범위와 용량

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

`.github/workflows/ingest.yml`이 매일 KST 07:10에 `daily`, 매주 월요일 07:40에 `supply`와 `refresh`(3~8개월 전 매매 재수집: 나중에 채워지는 등기일 반영)를 실행한다.
저장소 Settings → Secrets and variables → Actions에 다음 3개를 등록해야 한다.

| 이름 | 값 |
|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 인증키 (Decoding) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 |

`SUPABASE_DB_URL`은 마이그레이션용이라 등록하지 않는다. Actions 탭에서 `ingest` → Run workflow로 수동 실행할 수 있다.

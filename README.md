# BDS — 아파트 실거래·입주물량 대시보드

관심 지역(영통, 평촌·범계, 구성남, 강동, 송파)의 국토부 매매·전월세 실거래와 청약홈 입주 물량을 Supabase에 모아 보여 준다.

- `ingest/` 수집 스크립트 (`npm run ingest -- backfill | daily | supply`)
- `supabase/migrations/` 스키마·집계 함수 (`npm run db:push`로 적용)
- `app/` 대시보드 (Next.js, 인증 없음. DB 키는 서버에서만 사용)

## 배포

https://bds-black.vercel.app — Vercel(`hj20/bds`, 함수 지역 서울 `icn1`). `main`에 push하면 자동 배포된다.
Vercel 환경변수: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## 로컬 실행

1. `.env.example`을 `.env.local`로 복사하고 값을 채운다.
2. `npm ci` → `npm run dev` → http://localhost:3000
3. 점검: `npx tsx scripts/check-db.ts`, 테스트: `npm test`

## 자동 수집 (GitHub Actions)

`.github/workflows/ingest.yml`이 매일 KST 07:10에 `daily`, 매주 월요일 07:40에 `supply`를 실행한다.
저장소 Settings → Secrets and variables → Actions에 다음 3개를 등록해야 한다.

| 이름 | 값 |
|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터포털 인증키 (Decoding) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role 키 |

`SUPABASE_DB_URL`은 마이그레이션용이라 등록하지 않는다. Actions 탭에서 `ingest` → Run workflow로 수동 실행할 수 있다.

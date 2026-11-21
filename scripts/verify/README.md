# 화면 검사 도구

앱과 의존성을 나눠 두었다 (CI·Vercel 설치에 Playwright가 끼지 않게).

```sh
cd scripts/verify
npm i
npx playwright install chromium   # 또는 PW_CHROMIUM=<크로미움 실행 파일>
```

| 스크립트 | 하는 일 |
|---|---|
| `node pixdiff.mjs <로컬 주소> [--only 이름,이름] [--merge-text]` | 운영(https://bds-black.vercel.app, 바꾸기 전 코드)과 로컬 빌드를 같은 순간·같은 DB로 띄워 48개 화면 × 데스크톱·모바일을 픽셀·글자 단위로 비교. 리팩터링이 동작을 바꾸지 않았다면 모두 0픽셀. 다른 화면은 `pix/`에 이미지를 남긴다 |
| `node hoverdiff.mjs <로컬 주소>` | 차트 위 여러 지점에 마우스를 올렸을 때의 읽음 줄·툴팁을 운영과 비교 |
| `DATA=0 node e2e.mjs <주소>` | 모든 화면 200·콘솔 오류·가로 넘침, 필터·탭 동작 검사. `DATA=0`을 빼면 2026-11-16 DB 기준 숫자까지 대조(수집이 돌면 달라짐) |
| `node fav.mjs <주소>` | 관심 단지 ★ 추가·해제, `/watch`·`/new?fav=1` 동작 |

리팩터링을 검증할 때는 먼저 바꾸지 않은 코드로 `pixdiff`를 돌려 0이 나오는지 확인한다(보정). 2px 정도의 렌더 잡음은 다시 돌리면 사라진다.
`--merge-text`는 React가 텍스트를 여러 노드로 나눠 생기는 1/64px 폭 차이를 가려낸다.
로컬 주소는 운영 빌드(`npm run build && npx next start -p 3115` → `http://localhost:3115`)로 한다.

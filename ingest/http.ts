// 공공데이터 API 호출: 호출 간 최소 지연 + 지수 백오프 재시도 + 호출 수 집계

export class FatalApiError extends Error {}

export interface CallCounter {
  calls: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MIN_INTERVAL_MS = 300;
const MAX_RETRIES = 4; // 1s, 2s, 4s, 8s
let lastCallAt = 0;

/** url을 호출하고 parse 결과를 반환. parse가 FatalApiError를 던지면 재시도하지 않는다. */
export async function requestWithRetry<T>(
  url: string,
  parse: (text: string) => T,
  counter: CallCounter,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    counter.calls++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      return parse(text);
    } catch (e) {
      if (e instanceof FatalApiError || attempt >= MAX_RETRIES) throw e;
      const backoff = 1000 * 2 ** attempt;
      console.warn(`  재시도 ${attempt + 1}/${MAX_RETRIES} (${backoff}ms 후): ${(e as Error).message}`);
      await sleep(backoff);
    }
  }
}

// ---------- data.go.kr 공통 오류 응답 ----------

/** 키 미등록·트래픽 초과 등 재시도해도 소용없는 data.go.kr 오류 코드 */
export const DATA_GO_KR_FATAL = new Set(["20", "22", "30", "31", "32", "33"]);

/** data.go.kr 오류 코드·메시지 → 오류 (`${label} ${코드}: ${메시지}`), 재시도 무의미한 코드면 FatalApiError */
export function dataGoKrError(code: unknown, msg: unknown, label: string): Error {
  const Err = DATA_GO_KR_FATAL.has(String(code)) ? FatalApiError : Error;
  return new Err(`${label} ${code}: ${msg}`);
}

/** data.go.kr XML 오류 응답 → 오류 */
export function dataGoKrXmlError(text: string, label: string): Error {
  const code = /<returnReasonCode>(\w+)/.exec(text)?.[1] ?? /<resultCode>(\w+)/.exec(text)?.[1] ?? "?";
  const msg = /<returnAuthMsg>([^<]+)/.exec(text)?.[1] ?? /<resultMsg>([^<]+)/.exec(text)?.[1] ?? text.slice(0, 200);
  return dataGoKrError(code, msg, label);
}

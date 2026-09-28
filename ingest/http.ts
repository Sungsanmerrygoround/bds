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

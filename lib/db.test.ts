import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { retryOnTimeout } = await import("./db");

const res = (status: number, body: string) => new Response(body, { status });
afterEach(() => vi.unstubAllGlobals());

describe("retryOnTimeout", () => {
  it("statement timeout(57014)이면 한 번만 다시 시도", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(res(500, '{"code":"57014","message":"canceling statement due to statement timeout"}'))
      .mockResolvedValueOnce(res(200, "[]"));
    vi.stubGlobal("fetch", f);
    const r = await retryOnTimeout("http://x/rest/v1/rpc/complex_stats", { method: "POST" });
    expect(r.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("두 번째도 실패하면 그 응답을 그대로 (무한 재시도 없음)", async () => {
    const f = vi.fn().mockResolvedValue(res(500, '{"code":"57014"}'));
    vi.stubGlobal("fetch", f);
    expect((await retryOnTimeout("http://x")).status).toBe(500);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("다른 500·정상 응답은 다시 시도하지 않음", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(500, '{"code":"42883"}')).mockResolvedValueOnce(res(200, "[]"));
    vi.stubGlobal("fetch", f);
    expect((await retryOnTimeout("http://x")).status).toBe(500);
    expect((await retryOnTimeout("http://x")).status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

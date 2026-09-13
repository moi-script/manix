import { describe, expect, it, vi } from "vitest";
import { RateLimiter, RateLimitQueueFullError } from "../src/lib/rate-limiter";
import { buildQuery, MangaDexClient, MangaDexError } from "../src/modules/sources/mangadex/client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeClient(fetchImpl: typeof fetch, now = () => 0) {
  return new MangaDexClient({
    baseUrl: "https://api.mangadex.test",
    userAgent: "Manix-Test/0.0",
    fetchImpl,
    limiter: new RateLimiter(0),
    atHomeLimiter: new RateLimiter(0),
    sleep: vi.fn(async () => undefined),
    maxRetries: 2,
    breakerMs: 60_000,
    now,
  });
}

describe("buildQuery", () => {
  it("encodes scalars and appends [] to array keys", () => {
    const qs = buildQuery({
      title: "solo",
      limit: 20,
      includes: ["cover_art", "author"],
      "order[followedCount]": "desc",
      skipped: undefined,
    });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("title")).toBe("solo");
    expect(params.get("limit")).toBe("20");
    expect(params.getAll("includes[]")).toEqual(["cover_art", "author"]);
    expect(params.get("order[followedCount]")).toBe("desc");
    expect(params.has("skipped")).toBe(false);
  });

  it("returns an empty string when nothing is set", () => {
    expect(buildQuery({ tags: [] })).toBe("");
  });
});

describe("MangaDexClient", () => {
  it("sends the app User-Agent and no Via or Authorization header", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "ok" }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await client.get("/manga", { title: "solo" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mangadex.test/manga?title=solo");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Manix-Test/0.0");
    expect(headers.Via).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it("retries after a 429 and then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: "error" }, 429))
      .mockResolvedValueOnce(jsonResponse({ result: "ok", data: 1 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.get("/manga")).resolves.toEqual({ result: "ok", data: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws MangaDexError on 404 without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "error" }, 404));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.get("/manga/missing")).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("wraps repeated network failures as a 502 MangaDexError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    const err = await client.get("/manga").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MangaDexError);
    expect((err as MangaDexError).status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("opens the circuit breaker after three 403s and closes it after breakerMs", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "error" }, 403));
    const client = makeClient(fetchImpl as unknown as typeof fetch, () => now);

    for (let i = 0; i < 3; i++) await client.get("/manga").catch(() => undefined);
    expect(client.isAvailable()).toBe(false);

    await expect(client.get("/manga")).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    now = 60_001;
    expect(client.isAvailable()).toBe(true);
  });

  it("maps a full rate-limiter queue to a 503 without retrying or tripping the breaker", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "ok" }));
    const queueFullLimiter = {
      schedule: vi.fn(async () => {
        throw new RateLimitQueueFullError();
      }),
    } as unknown as RateLimiter;
    const client = new MangaDexClient({
      baseUrl: "https://api.mangadex.test",
      userAgent: "Manix-Test/0.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      limiter: queueFullLimiter,
      atHomeLimiter: queueFullLimiter,
      sleep: vi.fn(async () => undefined),
      maxRetries: 2,
      breakerMs: 60_000,
    });

    const err = await client.get("/manga").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MangaDexError);
    expect((err as MangaDexError).status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(queueFullLimiter.schedule).toHaveBeenCalledTimes(1);
    expect(client.isAvailable()).toBe(true);
  });

  it("calls the at-home endpoint for a chapter", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "ok", baseUrl: "https://node" }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await client.getAtHome("abc");

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.mangadex.test/at-home/server/abc");
  });
});

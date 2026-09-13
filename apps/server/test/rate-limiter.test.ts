import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../src/lib/rate-limiter";

describe("RateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spaces task starts by the interval in FIFO order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new RateLimiter(250);
    const starts: number[] = [];
    const run = (i: number) =>
      limiter.schedule(async () => {
        starts.push(Date.now());
        return i;
      });

    const all = Promise.all([run(0), run(1), run(2)]);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(all).resolves.toEqual([0, 1, 2]);
    expect(starts).toEqual([0, 250, 500]);
  });

  it("does not delay a task when the limiter has been idle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new RateLimiter(250);
    await limiter.schedule(async () => undefined);
    vi.setSystemTime(10_000);
    const startedAt = await limiter.schedule(async () => Date.now());
    expect(startedAt).toBe(10_000);
  });

  it("builds per-second and per-minute limiters", () => {
    expect(RateLimiter.perSecond(4)).toBeInstanceOf(RateLimiter);
    expect(RateLimiter.perMinute(36)).toBeInstanceOf(RateLimiter);
  });
});

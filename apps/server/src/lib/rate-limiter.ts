const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Thrown by `schedule` when the computed wait exceeds `maxWaitMs`. No slot is reserved. */
export class RateLimitQueueFullError extends Error {
  constructor() {
    super("Rate limiter queue is full");
  }
}

/**
 * Guarantees at least `intervalMs` between task starts. Slots are reserved
 * synchronously, so tasks start in the order they were scheduled.
 */
export class RateLimiter {
  private nextSlot = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
    private readonly maxWaitMs?: number,
  ) {}

  static perSecond(count: number, maxWaitMs?: number): RateLimiter {
    return new RateLimiter(1000 / count, undefined, undefined, maxWaitMs);
  }

  static perMinute(count: number, maxWaitMs?: number): RateLimiter {
    return new RateLimiter(60_000 / count, undefined, undefined, maxWaitMs);
  }

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    const wait = slot - now;
    if (this.maxWaitMs !== undefined && wait > this.maxWaitMs) {
      throw new RateLimitQueueFullError();
    }
    this.nextSlot = slot + this.intervalMs;
    if (wait > 0) await this.sleep(wait);
    return task();
  }
}

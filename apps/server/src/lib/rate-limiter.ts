const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  ) {}

  static perSecond(count: number): RateLimiter {
    return new RateLimiter(1000 / count);
  }

  static perMinute(count: number): RateLimiter {
    return new RateLimiter(60_000 / count);
  }

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const wait = slot - now;
    if (wait > 0) await this.sleep(wait);
    return task();
  }
}

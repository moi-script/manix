import { RateLimiter, RateLimitQueueFullError } from "../../../lib/rate-limiter";

export type Query = Record<string, string | number | boolean | string[] | undefined>;

export class MangaDexError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface MangaDexApi {
  get<T>(path: string, query?: Query): Promise<T>;
  getAtHome<T>(chapterId: string): Promise<T>;
  isAvailable(): boolean;
}

export interface MangaDexClientOptions {
  baseUrl: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
  atHomeLimiter?: RateLimiter;
  maxRetries?: number;
  breakerMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;
const BREAKER_THRESHOLD = 3;

export function buildQuery(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const arrayKey = key.endsWith("[]") ? key : `${key}[]`;
      for (const item of value) params.append(arrayKey, item);
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export class MangaDexClient implements MangaDexApi {
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;
  private readonly atHomeLimiter: RateLimiter;
  private readonly maxRetries: number;
  private readonly breakerMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private breakerUntil = 0;
  private consecutiveForbidden = 0;

  constructor(private readonly options: MangaDexClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.limiter = options.limiter ?? RateLimiter.perSecond(4, 10_000);
    this.atHomeLimiter = options.atHomeLimiter ?? RateLimiter.perMinute(36, 30_000);
    this.maxRetries = options.maxRetries ?? 3;
    this.breakerMs = options.breakerMs ?? 60_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  isAvailable(): boolean {
    return this.now() >= this.breakerUntil;
  }

  get<T>(path: string, query: Query = {}): Promise<T> {
    return this.request<T>(this.limiter, path, query);
  }

  getAtHome<T>(chapterId: string): Promise<T> {
    return this.request<T>(this.atHomeLimiter, `/at-home/server/${encodeURIComponent(chapterId)}`, {});
  }

  private async request<T>(limiter: RateLimiter, path: string, query: Query): Promise<T> {
    if (!this.isAvailable()) throw new MangaDexError(503, "MangaDex is temporarily unavailable");
    const url = `${this.options.baseUrl}${path}${buildQuery(query)}`;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await limiter.schedule(() =>
          this.fetchImpl(url, {
            headers: { "User-Agent": this.options.userAgent, Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }),
        );
      } catch (err) {
        if (err instanceof RateLimitQueueFullError) {
          throw new MangaDexError(503, "MangaDex request queue is full");
        }
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new MangaDexError(502, `MangaDex request failed for ${path}`);
      }

      if (res.ok) {
        this.consecutiveForbidden = 0;
        return (await res.json()) as T;
      }

      if (res.status === 429 && attempt < this.maxRetries) {
        await this.sleep(this.backoffFor(res, attempt));
        continue;
      }

      if (res.status === 403) {
        this.consecutiveForbidden += 1;
        if (this.consecutiveForbidden >= BREAKER_THRESHOLD) {
          this.breakerUntil = this.now() + this.breakerMs;
          this.consecutiveForbidden = 0;
        }
      }

      if (res.status >= 500 && attempt < this.maxRetries) {
        await this.sleep(1000 * 2 ** attempt);
        continue;
      }

      throw new MangaDexError(res.status, `MangaDex responded ${res.status} for ${path}`);
    }
  }

  private backoffFor(res: Response, attempt: number): number {
    let wait = 1000 * 2 ** attempt;
    // X-RateLimit-Retry-After is a unix timestamp in seconds.
    const retryAt = Number(res.headers.get("x-ratelimit-retry-after"));
    if (Number.isFinite(retryAt) && retryAt > 0) wait = Math.max(wait, retryAt * 1000 - this.now());
    // Retry-After is a delay in seconds.
    const retryAfter = Number(res.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) wait = Math.max(wait, retryAfter * 1000);
    return Math.min(wait, MAX_BACKOFF_MS);
  }
}

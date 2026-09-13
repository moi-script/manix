export interface ServerRequestOptions {
  /** Forward the visitor's cookies. Responses are then never cached. */
  withUser?: boolean;
  /** Seconds to cache a public response in the Next data cache. Omit for no caching. */
  revalidate?: number;
}

export interface BuiltServerRequest {
  url: string;
  init: RequestInit & { next?: { revalidate: number } };
}

/**
 * Pure builder for a server-side fetch to the Express API. Kept free of `next/headers` so it
 * can be unit tested directly.
 *
 * Per-visitor headers (X-Forwarded-For, Cookie) are only ever sent on uncached fetches — Next
 * includes request headers in its fetch cache key, so forwarding them on a cached fetch would
 * key the cache per visitor and defeat caching entirely.
 */
export function buildServerRequest(
  path: string,
  options: ServerRequestOptions,
  incomingForwardedFor: string | null | undefined,
  cookieHeader: string | null | undefined,
  internalToken: string | undefined,
  serverApiUrl: string,
): BuiltServerRequest {
  const base = serverApiUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { Accept: "application/json" };

  const cached = !options.withUser && options.revalidate !== undefined;

  if (!cached && incomingForwardedFor) headers["X-Forwarded-For"] = incomingForwardedFor;
  if (options.withUser && cookieHeader) headers.Cookie = cookieHeader;
  if (internalToken) headers["x-manix-internal"] = internalToken;

  const cacheInit: RequestInit & { next?: { revalidate: number } } = cached
    ? { next: { revalidate: options.revalidate as number } }
    : { cache: "no-store" };

  return { url: `${base}${path}`, init: { headers, ...cacheInit } };
}

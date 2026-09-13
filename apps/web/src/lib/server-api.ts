import { cookies, headers } from "next/headers";
import { parseApiError } from "./api";

const SERVER_API_URL = (process.env.SERVER_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export interface ServerApiOptions {
  /** Forward the visitor's cookies. Responses are then never cached. */
  withUser?: boolean;
  /** Seconds to cache a public response in the Next data cache. Omit for no caching. */
  revalidate?: number;
}

/** For server components only: calls the Express API directly. */
export async function serverApi<T>(path: string, options: ServerApiOptions = {}): Promise<T> {
  const requestHeaders: Record<string, string> = { Accept: "application/json" };

  const incoming = await headers();
  const forwardedFor = incoming.get("x-forwarded-for");
  if (forwardedFor) requestHeaders["X-Forwarded-For"] = forwardedFor;

  if (options.withUser) {
    const cookieHeader = (await cookies()).toString();
    if (cookieHeader) requestHeaders.Cookie = cookieHeader;
  }

  const cacheOptions =
    options.withUser || options.revalidate === undefined
      ? { cache: "no-store" as const }
      : { next: { revalidate: options.revalidate } };

  const res = await fetch(`${SERVER_API_URL}${path}`, { headers: requestHeaders, ...cacheOptions });
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as T;
}

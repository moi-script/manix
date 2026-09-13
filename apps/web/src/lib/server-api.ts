import { cookies, headers } from "next/headers";
import { parseApiError } from "./api";
import { buildServerRequest, type ServerRequestOptions } from "./server-request";

const SERVER_API_URL = process.env.SERVER_API_URL ?? "http://localhost:4000";
const INTERNAL_API_TOKEN = process.env.INTERNAL_API_TOKEN;

export type ServerApiOptions = ServerRequestOptions;

/** For server components only: calls the Express API directly. */
export async function serverApi<T>(path: string, options: ServerApiOptions = {}): Promise<T> {
  const incoming = await headers();
  const forwardedFor = incoming.get("x-forwarded-for");
  const cookieHeader = options.withUser ? (await cookies()).toString() : undefined;

  const { url, init } = buildServerRequest(path, options, forwardedFor, cookieHeader, INTERNAL_API_TOKEN, SERVER_API_URL);

  const res = await fetch(url, init);
  if (!res.ok) throw await parseApiError(res);
  return (await res.json()) as T;
}

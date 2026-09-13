import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/**
 * True when the request carries the `x-manix-internal` header matching `token` exactly.
 * Used to let the web app's own server-side fetches (made on behalf of many visitors)
 * skip the per-IP rate limiters. Constant-time comparison avoids leaking the token via timing.
 */
export function isInternalRequest(req: Request, token: string | undefined): boolean {
  if (!token) return false;
  const header = req.header("x-manix-internal");
  if (!header) return false;

  const provided = Buffer.from(header);
  const expected = Buffer.from(token);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

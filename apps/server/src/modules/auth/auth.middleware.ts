import type { Request, RequestHandler } from "express";
import type { Env } from "../../config/env";
import { HttpError } from "../../lib/errors";
import { verifyAccessToken, type AccessPayload } from "./tokens";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessPayload;
    }
  }
}

export const ACCESS_COOKIE = "mx_at";
export const REFRESH_COOKIE = "mx_rt";

export function authenticate(env: Env): RequestHandler {
  return (req, _res, next) => {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token === "string") {
      const payload = verifyAccessToken(token, env.JWT_ACCESS_SECRET);
      if (payload) req.auth = payload;
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new HttpError(401, "unauthorized", "Login required"));
    return;
  }
  next();
};

export function currentUserId(req: Request): string {
  if (!req.auth) throw new HttpError(401, "unauthorized", "Login required");
  return req.auth.sub;
}

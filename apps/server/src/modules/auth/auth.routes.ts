import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Env } from "../../config/env";
import { HttpError } from "../../lib/errors";
import { ACCESS_COOKIE, currentUserId, REFRESH_COOKIE, requireAuth } from "./auth.middleware";
import { AuthService, type AuthResult } from "./auth.service";
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from "./tokens";
import { toUserDTO, User } from "./user.model";

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/, "must be 3-24 letters, numbers, or underscores"),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export function authRouter(env: Env): Router {
  const service = new AuthService(env);
  const router = Router();
  const secure = env.NODE_ENV === "production";

  const credentialLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many attempts, try again later")),
  });

  function setAuthCookies(res: Response, result: AuthResult): void {
    res.cookie(ACCESS_COOKIE, result.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: ACCESS_TTL_SECONDS * 1000,
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/api/auth",
      maxAge: REFRESH_TTL_SECONDS * 1000,
    });
  }

  function clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  }

  router.post("/register", credentialLimiter, async (req, res) => {
    const body = registerSchema.parse(req.body);
    const result = await service.register(body, req.get("user-agent") ?? "");
    setAuthCookies(res, result);
    res.status(201).json({ user: toUserDTO(result.user) });
  });

  router.post("/login", credentialLimiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await service.login(body, req.get("user-agent") ?? "");
    setAuthCookies(res, result);
    res.json({ user: toUserDTO(result.user) });
  });

  router.post("/refresh", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== "string") throw new HttpError(401, "invalid_refresh", "No active session");
    try {
      const result = await service.refresh(token, req.get("user-agent") ?? "");
      setAuthCookies(res, result);
      res.json({ user: toUserDTO(result.user) });
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  });

  router.post("/logout", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    await service.logout(typeof token === "string" ? token : undefined);
    clearAuthCookies(res);
    res.status(204).end();
  });

  router.get("/me", requireAuth, async (req, res) => {
    const user = await User.findById(currentUserId(req));
    if (!user) throw new HttpError(401, "unauthorized", "Login required");
    res.json({ user: toUserDTO(user) });
  });

  return router;
}

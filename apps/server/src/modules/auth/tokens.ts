import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AccessPayload {
  sub: string;
  role: "user" | "admin";
}

export function signAccessToken(payload: AccessPayload, secret: string): string {
  return jwt.sign(payload, secret, { algorithm: "HS256", expiresIn: ACCESS_TTL_SECONDS });
}

export function verifyAccessToken(token: string, secret: string): AccessPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (typeof decoded === "string" || typeof decoded.sub !== "string") return null;
    return { sub: decoded.sub, role: decoded.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

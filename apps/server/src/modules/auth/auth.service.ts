import bcrypt from "bcryptjs";
import type { Env } from "../../config/env";
import { HttpError } from "../../lib/errors";
import { Session } from "./session.model";
import { hashRefreshToken, newRefreshToken, REFRESH_TTL_SECONDS, signAccessToken } from "./tokens";
import { User, type UserDoc } from "./user.model";

export interface AuthResult {
  user: UserDoc;
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(private readonly env: Env) {}

  async register(input: { email: string; username: string; password: string }, userAgent: string): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const existing = await User.findOne({ $or: [{ email }, { username: input.username }] });
    if (existing) {
      if (existing.email === email) throw new HttpError(409, "email_taken", "Email is already registered");
      throw new HttpError(409, "username_taken", "Username is taken");
    }
    const passwordHash = await bcrypt.hash(input.password, this.env.BCRYPT_COST);
    const user = await User.create({ email, username: input.username, passwordHash });
    return this.issue(user, userAgent);
  }

  async login(input: { email: string; password: string }, userAgent: string): Promise<AuthResult> {
    const user = await User.findOne({ email: input.email.toLowerCase() });
    const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !valid) throw new HttpError(401, "invalid_credentials", "Invalid email or password");
    return this.issue(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent: string): Promise<AuthResult> {
    const session = await Session.findOneAndDelete({
      refreshTokenHash: hashRefreshToken(refreshToken, this.env.JWT_REFRESH_SECRET),
      expiresAt: { $gt: new Date() },
    });
    if (!session) throw new HttpError(401, "invalid_refresh", "Session expired, please log in again");
    const user = await User.findById(session.userId);
    if (!user) throw new HttpError(401, "invalid_refresh", "Session expired, please log in again");
    return this.issue(user, userAgent);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await Session.deleteOne({ refreshTokenHash: hashRefreshToken(refreshToken, this.env.JWT_REFRESH_SECRET) });
  }

  private async issue(user: UserDoc, userAgent: string): Promise<AuthResult> {
    const refreshToken = newRefreshToken();
    await Session.create({
      userId: user._id,
      refreshTokenHash: hashRefreshToken(refreshToken, this.env.JWT_REFRESH_SECRET),
      userAgent: userAgent.slice(0, 300),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });
    const accessToken = signAccessToken({ sub: String(user._id), role: user.role }, this.env.JWT_ACCESS_SECRET);
    return { user, accessToken, refreshToken };
  }
}

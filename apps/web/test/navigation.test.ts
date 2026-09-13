import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "@/lib/auth-errors";
import { ApiError } from "@/lib/api";
import { safeNext } from "@/lib/navigation";

describe("safeNext", () => {
  it("allows same-site paths only", () => {
    expect(safeNext("/library")).toBe("/library");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(null, "/search")).toBe("/search");
  });
});

describe("friendlyAuthError", () => {
  it("explains known auth failures", () => {
    expect(friendlyAuthError(new ApiError(401, "invalid_credentials", "x"))).toBe("That email and password don't match an account.");
    expect(friendlyAuthError(new ApiError(409, "email_taken", "x"))).toBe("An account with this email already exists. Log in instead.");
    expect(friendlyAuthError(new ApiError(409, "username_taken", "x"))).toBe("That username is taken. Try another one.");
    expect(friendlyAuthError(new ApiError(429, "rate_limited", "x"))).toBe("Too many attempts. Wait a few minutes, then try again.");
    expect(friendlyAuthError(new ApiError(400, "validation_error", "password: too short"))).toBe("password: too short");
  });
});

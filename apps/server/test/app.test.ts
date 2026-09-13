import request from "supertest";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env";
import { buildTestApp } from "./helpers/app";

describe("app skeleton", () => {
  it("responds to health checks", async () => {
    const res = await request(buildTestApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(buildTestApp()).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Route not found" } });
  });

  it("rejects an invalid environment", () => {
    expect(() => loadEnv({ NODE_ENV: "test" })).toThrow(/Invalid environment/);
  });

  it("parses TRUST_PROXY as a number, a passthrough string, or the default", () => {
    const base = {
      NODE_ENV: "test",
      MONGODB_URI: "mongodb://unused-in-tests",
      JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef",
      JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef",
      APP_USER_AGENT: "Manix-Test/0.0",
    };
    expect(loadEnv({ ...base, TRUST_PROXY: "2" }).TRUST_PROXY).toBe(2);
    expect(loadEnv({ ...base, TRUST_PROXY: "loopback" }).TRUST_PROXY).toBe("loopback");
    expect(loadEnv(base).TRUST_PROXY).toBe(1);
  });
});

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
});

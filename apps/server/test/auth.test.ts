import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { User } from "../src/modules/auth/user.model";
import { buildTestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";

function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${name}=`));
  return cookie?.split(";")[0].slice(name.length + 1);
}

const credentials = { email: "Reader@Example.com", username: "reader_1", password: "password123" };

describe("auth", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await startTestDb();
    await User.init();
  });
  afterEach(clearTestDb);
  afterAll(stopTestDb);

  it("registers a user, sets cookies, and returns the profile from /me", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/register").send(credentials);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "reader@example.com", username: "reader_1", role: "user" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(cookieValue(res, "mx_at")).toBeTruthy();
    expect(cookieValue(res, "mx_rt")).toBeTruthy();

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("reader_1");
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/api/auth/register").send(credentials);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...credentials, username: "someone_else" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
  });

  it("validates registration input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", username: "x", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    await request(app).post("/api/auth/register").send(credentials);
    const bad = await request(app).post("/api/auth/login").send({ email: credentials.email, password: "wrong-password" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("invalid_credentials");

    const good = await request(app).post("/api/auth/login").send({ email: credentials.email, password: credentials.password });
    expect(good.status).toBe(200);
    expect(good.body.user.username).toBe("reader_1");
  });

  it("rotates the refresh token and rejects reuse of the old one", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send(credentials);
    const oldRefresh = cookieValue(reg, "mx_rt");

    const refreshed = await agent.post("/api/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect(cookieValue(refreshed, "mx_rt")).not.toBe(oldRefresh);

    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", `mx_rt=${oldRefresh}`);
    expect(reuse.status).toBe(401);
  });

  it("does not clear auth cookies when a stale refresh token is rejected after a successful rotation", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send(credentials);
    const oldRefresh = cookieValue(reg, "mx_rt");

    const rotated = await agent.post("/api/auth/refresh");
    expect(rotated.status).toBe(200);

    // A second tab/request still holding the now-stale (rotated-away) refresh token.
    const stale = await request(app).post("/api/auth/refresh").set("Cookie", `mx_rt=${oldRefresh}`);
    expect(stale.status).toBe(401);
    const setCookie = (stale.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    const clears = setCookie.filter((c) => /^(mx_at|mx_rt)=;/.test(c) || /^(mx_at|mx_rt)=$/.test(c));
    expect(clears).toEqual([]);

    // The session rotated in the first request is still usable.
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
  });

  it("logs out and invalidates the session", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(credentials);
    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    expect((await agent.post("/api/auth/refresh")).status).toBe(401);
  });

  it("requires auth for /me", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("maps a duplicate-registration race to one 201 and one 409, not a 500", async () => {
    const [first, second] = await Promise.all([
      request(app).post("/api/auth/register").send(credentials),
      request(app).post("/api/auth/register").send({ ...credentials, username: "someone_else" }),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = first.status === 409 ? first : second;
    expect(failed.body.error.code).toBe("email_taken");
  });
});

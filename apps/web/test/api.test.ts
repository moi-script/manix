import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { jsonResponse } from "./fixtures";

function fetchMock(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => handler(String(input), init));
}

describe("api", () => {
  it("sends same-origin JSON requests and parses the response", async () => {
    const fetchImpl = fetchMock(() => jsonResponse({ ok: true }));
    const result = await api<{ ok: boolean }>("/api/library/x", { method: "PUT", body: { status: "reading" } }, fetchImpl);

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/library/x");
    expect(init).toMatchObject({ method: "PUT", credentials: "same-origin", body: JSON.stringify({ status: "reading" }) });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("throws ApiError with the server's code and message", async () => {
    const fetchImpl = fetchMock(() => jsonResponse({ error: { code: "manga_not_found", message: "Manga not found" } }, 404));
    const err = await api("/api/manga/x", {}, fetchImpl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: "manga_not_found", message: "Manga not found" });
  });

  it("falls back to a generic error when the body is not JSON", async () => {
    const fetchImpl = fetchMock(() => new Response("Bad gateway", { status: 502 }));
    await expect(api("/api/manga", {}, fetchImpl)).rejects.toMatchObject({ status: 502, code: "http_error" });
  });

  it("returns undefined for 204 responses", async () => {
    const fetchImpl = fetchMock(() => new Response(null, { status: 204 }));
    await expect(api("/api/library/x", { method: "DELETE" }, fetchImpl)).resolves.toBeUndefined();
  });

  it("refreshes the session once on 401 and retries the request", async () => {
    let authed = false;
    const fetchImpl = fetchMock((url) => {
      if (url === "/api/auth/refresh") {
        authed = true;
        return jsonResponse({ user: {} });
      }
      return authed ? jsonResponse({ entries: [] }) : jsonResponse({ error: { code: "unauthorized", message: "Login required" } }, 401);
    });

    await expect(api("/api/library", {}, fetchImpl)).resolves.toEqual({ entries: [] });
    expect(fetchImpl.mock.calls.map(([u]) => String(u))).toEqual(["/api/library", "/api/auth/refresh", "/api/library"]);
  });

  it("shares one refresh between concurrent 401s", async () => {
    let authed = false;
    let refreshCalls = 0;
    const fetchImpl = fetchMock(async (url) => {
      if (url === "/api/auth/refresh") {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        authed = true;
        return jsonResponse({ user: {} });
      }
      return authed ? jsonResponse({ ok: url }) : jsonResponse({ error: { code: "unauthorized", message: "x" } }, 401);
    });

    await Promise.all([api("/api/library", {}, fetchImpl), api("/api/history", {}, fetchImpl), api("/api/progress/continue", {}, fetchImpl)]);
    expect(refreshCalls).toBe(1);
  });

  it("throws the original 401 when the refresh fails", async () => {
    const fetchImpl = fetchMock(() => jsonResponse({ error: { code: "unauthorized", message: "Login required" } }, 401));
    await expect(api("/api/auth/me", {}, fetchImpl)).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });

  it("never refreshes for credential endpoints", async () => {
    const fetchImpl = fetchMock(() => jsonResponse({ error: { code: "invalid_credentials", message: "Invalid email or password" } }, 401));
    await expect(api("/api/auth/login", { method: "POST", body: {} }, fetchImpl)).rejects.toMatchObject({ code: "invalid_credentials" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

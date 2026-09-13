import { describe, expect, it } from "vitest";
import { buildServerRequest } from "@/lib/server-request";

const SERVER_URL = "http://localhost:4000";

describe("buildServerRequest", () => {
  it("caches without forwarding the visitor's IP, and adds the internal header when a token is given", () => {
    const { url, init } = buildServerRequest("/api/manga/1", { revalidate: 3600 }, "1.2.3.4", undefined, "internal-token", SERVER_URL);

    expect(url).toBe("http://localhost:4000/api/manga/1");
    expect(init.headers).not.toHaveProperty("X-Forwarded-For");
    expect(init.headers).toMatchObject({ "x-manix-internal": "internal-token" });
    expect(init.next).toEqual({ revalidate: 3600 });
    expect(init.cache).toBeUndefined();
  });

  it("omits the internal header when no token is configured", () => {
    const { init } = buildServerRequest("/api/manga/1", { revalidate: 3600 }, "1.2.3.4", undefined, undefined, SERVER_URL);
    expect(init.headers).not.toHaveProperty("x-manix-internal");
  });

  it("forwards the visitor's IP and disables caching when uncached (no revalidate)", () => {
    const { init } = buildServerRequest("/api/search", {}, "1.2.3.4", undefined, undefined, SERVER_URL);
    expect(init.headers).toMatchObject({ "X-Forwarded-For": "1.2.3.4" });
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("forwards cookies and the visitor's IP, and disables caching for withUser fetches, even with revalidate set", () => {
    const { init } = buildServerRequest("/api/me", { withUser: true, revalidate: 60 }, "1.2.3.4", "session=abc", undefined, SERVER_URL);
    expect(init.headers).toMatchObject({ Cookie: "session=abc", "X-Forwarded-For": "1.2.3.4" });
    expect(init.cache).toBe("no-store");
    expect(init.next).toBeUndefined();
  });

  it("strips a trailing slash from the server URL", () => {
    const { url } = buildServerRequest("/api/x", {}, undefined, undefined, undefined, "http://localhost:4000/");
    expect(url).toBe("http://localhost:4000/api/x");
  });
});

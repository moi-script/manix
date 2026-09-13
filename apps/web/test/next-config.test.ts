import { describe, expect, it } from "vitest";
import nextConfig, { apiRewrites, securityHeaders } from "../next.config";

describe("apiRewrites", () => {
  it("proxies API and image paths to the server without a double slash", () => {
    expect(apiRewrites("http://localhost:4000/")).toEqual([
      { source: "/api/:path*", destination: "http://localhost:4000/api/:path*" },
      { source: "/img/:path*", destination: "http://localhost:4000/img/:path*" },
    ]);
  });
});

describe("securityHeaders", () => {
  it("sets frame, referrer, and content-type hardening headers", () => {
    expect(securityHeaders()).toEqual([
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
    ]);
  });

  it("applies the security headers to every path via the headers() function", async () => {
    const result = await nextConfig.headers?.();
    expect(result).toEqual([{ source: "/:path*", headers: securityHeaders() }]);
  });
});

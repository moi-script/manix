import { describe, expect, it } from "vitest";
import { apiRewrites } from "../next.config";

describe("apiRewrites", () => {
  it("proxies API and image paths to the server without a double slash", () => {
    expect(apiRewrites("http://localhost:4000/")).toEqual([
      { source: "/api/:path*", destination: "http://localhost:4000/api/:path*" },
      { source: "/img/:path*", destination: "http://localhost:4000/img/:path*" },
    ]);
  });
});

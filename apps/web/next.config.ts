import type { NextConfig } from "next";

/** Same-origin API and image paths are proxied to the Express server. */
export function apiRewrites(serverUrl: string) {
  const base = serverUrl.replace(/\/+$/, "");
  return [
    { source: "/api/:path*", destination: `${base}/api/:path*` },
    { source: "/img/:path*", destination: `${base}/img/:path*` },
  ];
}

/** Baseline hardening headers applied to every response. */
export function securityHeaders() {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
  ];
}

const nextConfig: NextConfig = {
  transpilePackages: ["@manix/shared"],
  poweredByHeader: false,
  async rewrites() {
    return apiRewrites(process.env.SERVER_API_URL ?? "http://localhost:4000");
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
};

export default nextConfig;

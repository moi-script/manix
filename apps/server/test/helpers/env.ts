import os from "node:os";
import path from "node:path";
import { loadEnv, type Env } from "../../src/config/env";

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://unused-in-tests",
    JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef",
    JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef",
    APP_USER_AGENT: "Manix-Test/0.0",
    BCRYPT_COST: "4",
    IMAGE_CACHE_DIR: path.join(os.tmpdir(), "manix-test-images"),
    IMAGE_WARM_PAGES: "0",
    MANGADEX_API_URL: "https://api.mangadex.test",
    MANGADEX_UPLOADS_URL: "https://uploads.mangadex.test",
    MANGADEX_REPORT_URL: "https://report.mangadex.test/report",
    ...overrides,
  });
}

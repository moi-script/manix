import { z } from "zod";

/**
 * Express's `trust proxy` setting. A digit string is the number of hops to trust
 * (e.g. "1"); "true"/"false" toggle trusting all/no proxies; anything else (e.g.
 * "loopback", a comma-separated subnet list) is passed through as-is.
 */
function parseTrustProxy(value: string): number | boolean | string {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  APP_USER_AGENT: z.string().min(3),
  IMAGE_CACHE_DIR: z.string().min(1).default(".cache/images"),
  IMAGE_CACHE_MAX_GB: z.coerce.number().positive().default(10),
  MANGADEX_API_URL: z.string().url().default("https://api.mangadex.org"),
  MANGADEX_UPLOADS_URL: z.string().url().default("https://uploads.mangadex.org"),
  MANGADEX_REPORT_URL: z.string().url().default("https://api.mangadex.network/report"),
  TRUST_PROXY: z.string().default("1").transform(parseTrustProxy),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

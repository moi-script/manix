/** Loads `.env` into `process.env` if present; silently does nothing otherwise (e.g. in production). */
export function loadDotEnvIfPresent(): void {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file: use the real environment (e.g. in production).
  }
}

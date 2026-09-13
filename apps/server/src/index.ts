import mongoose from "mongoose";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { loadDotEnvIfPresent } from "./config/load-dotenv";
import { connectDb } from "./db/connect";
import { MangaDexClient } from "./modules/sources/mangadex/client";

loadDotEnvIfPresent();

const env = loadEnv();
await connectDb(env.MONGODB_URI);

const mangadex = new MangaDexClient({ baseUrl: env.MANGADEX_API_URL, userAgent: env.APP_USER_AGENT });
const app = createApp({ env, mangadex });

const server = app.listen(env.PORT, () => {
  console.log(`Manix server listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void mongoose.disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

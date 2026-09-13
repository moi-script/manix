import mongoose from "mongoose";
import { loadEnv } from "../config/env";
import { connectDb } from "../db/connect";
import { BlockedGroup } from "../modules/moderation/blocked-group.model";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: use the real environment.
}

const [groupId, ...reasonWords] = process.argv.slice(2);
if (!groupId) {
  console.error("Usage: npm run block-group -w @manix/server -- <scanlationGroupId> <reason...>");
  process.exit(1);
}

const env = loadEnv();
await connectDb(env.MONGODB_URI);
await BlockedGroup.updateOne(
  { groupSourceId: groupId },
  { $set: { reason: reasonWords.join(" ") }, $setOnInsert: { requestedAt: new Date() } },
  { upsert: true },
);
console.log(`Blocked scanlation group ${groupId}. Its chapters are no longer listed or served.`);
await mongoose.disconnect();

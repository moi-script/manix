import mongoose from "mongoose";
import { z } from "zod";
import { loadEnv } from "../config/env";
import { loadDotEnvIfPresent } from "../config/load-dotenv";
import { connectDb } from "../db/connect";
import { BlockedGroup } from "../modules/moderation/blocked-group.model";

const USAGE = "Usage: npm run block-group -w @manix/server -- <scanlationGroupId> <reason...>";

const [rawGroupId, ...reasonWords] = process.argv.slice(2);
const parsedGroupId = z.string().uuid().safeParse(rawGroupId);
if (!parsedGroupId.success) {
  console.error(USAGE);
  console.error(`error: <scanlationGroupId> must be a UUID, got: ${rawGroupId ?? "(none)"}`);
  process.exit(1);
}
const groupId = parsedGroupId.data;

loadDotEnvIfPresent();
const env = loadEnv();
await connectDb(env.MONGODB_URI);
await BlockedGroup.updateOne(
  { groupSourceId: groupId },
  { $set: { reason: reasonWords.join(" ") }, $setOnInsert: { requestedAt: new Date() } },
  { upsert: true },
);
console.log(`Blocked scanlation group ${groupId}. Its chapters are no longer listed or served.`);
await mongoose.disconnect();

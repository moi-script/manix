import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let server: MongoMemoryServer | undefined;

export async function startTestDb(): Promise<void> {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
}

export async function clearTestDb(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  await server?.stop();
}

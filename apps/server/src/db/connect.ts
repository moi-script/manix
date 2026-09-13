import mongoose from "mongoose";

export async function connectDb(uri: string): Promise<typeof mongoose.connection> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

import type { ReadingStatus } from "@manix/shared";
import { Schema, model, type Types } from "mongoose";

export interface LibraryAttrs {
  userId: Types.ObjectId;
  mangaSourceId: string;
  status: ReadingStatus;
  officialEpisode?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const librarySchema = new Schema<LibraryAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mangaSourceId: { type: String, required: true },
    status: { type: String, enum: ["reading", "plan", "completed", "dropped"], required: true },
    officialEpisode: { type: Number, default: null },
  },
  { timestamps: true },
);

librarySchema.index({ userId: 1, mangaSourceId: 1 }, { unique: true });
librarySchema.index({ userId: 1, updatedAt: -1 });

export const LibraryEntry = model<LibraryAttrs>("LibraryEntry", librarySchema);

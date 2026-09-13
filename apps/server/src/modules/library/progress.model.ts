import { Schema, model, type Types } from "mongoose";

export interface ProgressAttrs {
  userId: Types.ObjectId;
  mangaSourceId: string;
  chapterSourceId: string;
  chapterNumber: string | null;
  page: number;
  totalPages: number;
  createdAt: Date;
  updatedAt: Date;
}

const progressSchema = new Schema<ProgressAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mangaSourceId: { type: String, required: true },
    chapterSourceId: { type: String, required: true },
    chapterNumber: { type: String, default: null },
    page: { type: Number, required: true, min: 0 },
    totalPages: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

progressSchema.index({ userId: 1, mangaSourceId: 1 }, { unique: true });
progressSchema.index({ userId: 1, updatedAt: -1 });

export const Progress = model<ProgressAttrs>("Progress", progressSchema);

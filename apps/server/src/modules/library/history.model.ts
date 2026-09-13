import { Schema, model, type Types } from "mongoose";

export interface HistoryAttrs {
  userId: Types.ObjectId;
  mangaSourceId: string;
  chapterSourceId: string;
  readAt: Date;
}

const historySchema = new Schema<HistoryAttrs>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  mangaSourceId: { type: String, required: true },
  chapterSourceId: { type: String, required: true },
  readAt: { type: Date, required: true },
});

historySchema.index({ userId: 1, chapterSourceId: 1 }, { unique: true });
historySchema.index({ userId: 1, readAt: -1 });

export const History = model<HistoryAttrs>("History", historySchema);

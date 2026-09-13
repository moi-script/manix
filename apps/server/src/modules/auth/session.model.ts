import { Schema, model, type Types } from "mongoose";

export interface SessionAttrs {
  userId: Types.ObjectId;
  refreshTokenHash: string;
  userAgent: string;
  expiresAt: Date;
}

const sessionSchema = new Schema<SessionAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<SessionAttrs>("Session", sessionSchema);

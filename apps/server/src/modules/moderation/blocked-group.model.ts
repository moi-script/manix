import { Schema, model } from "mongoose";

export interface BlockedGroupAttrs {
  groupSourceId: string;
  name: string;
  reason: string;
  requestedAt: Date;
}

const blockedGroupSchema = new Schema<BlockedGroupAttrs>({
  groupSourceId: { type: String, required: true, unique: true },
  name: { type: String, default: "" },
  reason: { type: String, default: "" },
  requestedAt: { type: Date, default: () => new Date() },
});

export const BlockedGroup = model<BlockedGroupAttrs>("BlockedGroup", blockedGroupSchema);

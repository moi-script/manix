import type { UserDTO, UserPrefs } from "@manix/shared";
import { Schema, model, type HydratedDocument } from "mongoose";

export interface UserAttrs {
  email: string;
  username: string;
  passwordHash: string;
  role: "user" | "admin";
  prefs: UserPrefs;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDoc = HydratedDocument<UserAttrs>;

const userSchema = new Schema<UserAttrs>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    prefs: {
      readerMode: { type: String, enum: ["strip", "paged"], default: "strip" },
      dataSaver: { type: Boolean, default: false },
      contentRating: { type: [String], default: ["safe", "suggestive"] },
    },
  },
  { timestamps: true },
);

export const User = model<UserAttrs>("User", userSchema);

export function toUserDTO(user: UserDoc): UserDTO {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    role: user.role,
    prefs: {
      readerMode: user.prefs.readerMode,
      dataSaver: user.prefs.dataSaver,
      contentRating: [...user.prefs.contentRating],
    },
  };
}

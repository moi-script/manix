import type { ApiError } from "./api";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match an account.",
  email_taken: "An account with this email already exists. Log in instead.",
  username_taken: "That username is taken. Try another one.",
  rate_limited: "Too many attempts. Wait a few minutes, then try again.",
};

export function friendlyAuthError(err: ApiError): string {
  return MESSAGES[err.code] ?? err.message;
}

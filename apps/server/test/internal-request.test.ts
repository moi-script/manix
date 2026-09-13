import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { isInternalRequest } from "../src/lib/internal-request";

const TOKEN = "a".repeat(32);

function reqWithHeader(value: string | undefined): Request {
  return { header: (name: string) => (name === "x-manix-internal" ? value : undefined) } as unknown as Request;
}

describe("isInternalRequest", () => {
  it("is false when no token is configured", () => {
    expect(isInternalRequest(reqWithHeader(TOKEN), undefined)).toBe(false);
  });

  it("is false when the header is missing", () => {
    expect(isInternalRequest(reqWithHeader(undefined), TOKEN)).toBe(false);
  });

  it("is false when the header doesn't match, including different lengths", () => {
    expect(isInternalRequest(reqWithHeader("b".repeat(32)), TOKEN)).toBe(false);
    expect(isInternalRequest(reqWithHeader("a".repeat(31)), TOKEN)).toBe(false);
    expect(isInternalRequest(reqWithHeader("a".repeat(33)), TOKEN)).toBe(false);
  });

  it("is true when the header exactly matches the token", () => {
    expect(isInternalRequest(reqWithHeader(TOKEN), TOKEN)).toBe(true);
  });
});

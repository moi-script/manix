import { describe, expect, it } from "vitest";
import { nearEnd, pageFromScroll, preloadRange, progressPercent } from "@/lib/reader";

describe("reader helpers", () => {
  it("preloads up to four pages ahead within bounds", () => {
    expect(preloadRange(0, 10)).toEqual([1, 2, 3, 4]);
    expect(preloadRange(8, 10)).toEqual([9]);
    expect(preloadRange(9, 10)).toEqual([]);
    expect(preloadRange(0, 0)).toEqual([]);
  });

  it("computes progress as a whole percentage", () => {
    expect(progressPercent(0, 4)).toBe(25);
    expect(progressPercent(3, 4)).toBe(100);
    expect(progressPercent(0, 0)).toBe(0);
  });

  it("detects the last three pages", () => {
    expect(nearEnd(7, 10)).toBe(true);
    expect(nearEnd(6, 10)).toBe(false);
    expect(nearEnd(0, 0)).toBe(false);
  });

  it("finds the page crossing the upper third of the viewport", () => {
    expect(pageFromScroll([0, 1000, 2000], 0, 900)).toBe(0);
    expect(pageFromScroll([0, 1000, 2000], 800, 900)).toBe(1);
    expect(pageFromScroll([0, 1000, 2000], 5000, 900)).toBe(2);
    expect(pageFromScroll([], 0, 900)).toBe(0);
  });
});

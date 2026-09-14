import type { ChapterDTO } from "@manix/shared";
import { describe, expect, it } from "vitest";
import { chapterGaps, gapLabel } from "@/lib/chapter-gaps";

function ch(id: string, number: string | null): Pick<ChapterDTO, "id" | "number"> {
  return { id, number };
}

describe("chapterGaps", () => {
  it("finds a leading gap and gaps between whole chapter numbers", () => {
    const gaps = chapterGaps([ch("a", "207"), ch("b", "210"), ch("c", "223.9")]);
    expect(gaps).toEqual([
      { from: 1, to: 206, belowChapterId: "a" },
      { from: 208, to: 209, belowChapterId: "b" },
      { from: 211, to: 222, belowChapterId: "c" },
    ]);
  });

  it("ignores decimals within the same chapter, duplicate uploads, and unnumbered chapters", () => {
    expect(
      chapterGaps([ch("a", "1"), ch("b", "1.5"), ch("c", "2"), ch("d", "2"), ch("e", "3"), ch("f", null)]),
    ).toEqual([]);
  });

  it("treats chapter 0 as a valid start", () => {
    expect(chapterGaps([ch("a", "0"), ch("b", "1")])).toEqual([]);
  });

  it("returns nothing when there are no numbered chapters", () => {
    expect(chapterGaps([])).toEqual([]);
    expect(chapterGaps([ch("a", null)])).toEqual([]);
  });

  it("attaches the gap to the first upload of the chapter after it", () => {
    expect(chapterGaps([ch("a", "1"), ch("b", "4"), ch("c", "4")])).toEqual([{ from: 2, to: 3, belowChapterId: "b" }]);
  });
});

describe("gapLabel", () => {
  it("names a single chapter or a range", () => {
    expect(gapLabel({ from: 5, to: 5 })).toBe("Chapter 5");
    expect(gapLabel({ from: 1, to: 206 })).toBe("Chapters 1–206");
  });
});

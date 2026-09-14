import type { ChapterDTO } from "@manix/shared";

export interface ChapterGap {
  /** First and last whole chapter number that is missing. */
  from: number;
  to: number;
  /** The first upload of the chapter right after the gap; newest-first lists show the gap below it. */
  belowChapterId: string;
}

/**
 * Whole-number chapter ranges missing from a chapter list sorted oldest first — including chapters
 * before the first one, since a series normally starts at chapter 1 (0 counts as a valid start).
 * Decimal chapters (12.5) and duplicate uploads by different groups are not gaps.
 */
export function chapterGaps(chapters: Pick<ChapterDTO, "id" | "number">[]): ChapterGap[] {
  const gaps: ChapterGap[] = [];
  let previous = 0;
  let seenAny = false;
  for (const chapter of chapters) {
    const value = chapter.number === null ? Number.NaN : Math.floor(Number.parseFloat(chapter.number));
    if (!Number.isFinite(value) || (seenAny && value <= previous)) continue;
    const expected = seenAny ? previous + 1 : Math.min(1, value);
    if (value > expected) gaps.push({ from: expected, to: value - 1, belowChapterId: chapter.id });
    previous = value;
    seenAny = true;
  }
  return gaps;
}

export function gapLabel(gap: Pick<ChapterGap, "from" | "to">): string {
  return gap.from === gap.to ? `Chapter ${gap.from}` : `Chapters ${gap.from}–${gap.to}`;
}

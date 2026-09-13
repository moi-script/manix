export const PRELOAD_AHEAD = 4;
export const NEAR_END_PAGES = 3;

export function preloadRange(current: number, total: number, ahead = PRELOAD_AHEAD): number[] {
  const indices: number[] = [];
  for (let i = current + 1; i <= current + ahead && i < total; i++) indices.push(i);
  return indices;
}

export function progressPercent(page: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round(((page + 1) / total) * 100));
}

export function nearEnd(page: number, total: number): boolean {
  return total > 0 && page >= total - NEAR_END_PAGES;
}

/** The current page is the last one whose top edge has crossed the upper third of the viewport. */
export function pageFromScroll(offsets: number[], scrollY: number, viewportHeight: number): number {
  const line = scrollY + viewportHeight / 3;
  let current = 0;
  offsets.forEach((top, index) => {
    if (top <= line) current = index;
  });
  return current;
}

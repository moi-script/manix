/** Only allow redirects to paths on this site. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/")) return fallback;
  try {
    const base = "http://manix.invalid";
    const url = new URL(next, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

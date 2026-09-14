import type { OfficialLinkDTO } from "@manix/shared";

const KNOWN_SITES: [host: string, name: string][] = [
  ["webtoons.com", "WEBTOON"],
  ["tapas.io", "Tapas"],
  ["tappytoon.com", "Tappytoon"],
  ["lezhinus.com", "Lezhin"],
  ["lezhin.com", "Lezhin"],
  ["manta.net", "Manta"],
  ["pocketcomics.com", "Pocket Comics"],
  ["tapas.com", "Tapas"],
  ["mangaplus.shueisha.co.jp", "MANGA Plus"],
  ["comikey.com", "Comikey"],
  ["inkr.com", "INKR"],
  ["globalcomix.com", "GlobalComix"],
  ["yenpress.com", "Yen Press"],
  ["webnovel.com", "Webnovel"],
  ["webcomicsapp.com", "WebComics"],
  ["viz.com", "VIZ"],
  ["kodansha.us", "Kodansha"],
];

function parseHttpUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

/** A readable publisher name for a URL: a known site, else `fallback`, else the bare hostname. */
export function siteName(url: string, fallback?: string): string {
  const host = (parseHttpUrl(url)?.hostname ?? "").replace(/^www\./, "");
  const known = KNOWN_SITES.find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  return known?.[1] ?? (fallback || host);
}

export function officialLink(url: string, fallbackSite?: string): OfficialLinkDTO | null {
  return parseHttpUrl(url) ? { site: siteName(url, fallbackSite), url } : null;
}

/** MangaDex's `engtl` is the official English release; other keys are raws, stores, or trackers. */
export function linksFromMangaDex(links: Record<string, string> | null | undefined): OfficialLinkDTO[] {
  const link = links?.engtl ? officialLink(links.engtl) : null;
  return link ? [link] : [];
}

function urlKey(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/+$/, "");
}

/** Concatenates link lists, keeping the first occurrence of each URL. */
export function mergeLinks(...lists: OfficialLinkDTO[][]): OfficialLinkDTO[] {
  const seen = new Set<string>();
  const merged: OfficialLinkDTO[] = [];
  for (const link of lists.flat()) {
    const key = urlKey(link.url);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ site: link.site, url: link.url });
  }
  return merged;
}

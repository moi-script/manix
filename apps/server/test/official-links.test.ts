import { describe, expect, it, vi } from "vitest";
import { AniListClient } from "../src/modules/sources/anilist/client";
import { linksFromMangaDex, mergeLinks, siteName } from "../src/modules/sources/official-links";

const ANILIST_URL = "https://graphql.anilist.test";

describe("siteName", () => {
  it("names known publishers from the hostname", () => {
    expect(siteName("https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154")).toBe("WEBTOON");
    expect(siteName("https://tapas.io/series/solo-leveling-ragnarok/info")).toBe("Tapas");
    expect(siteName("https://www.tappytoon.com/en/book/x")).toBe("Tappytoon");
    expect(siteName("https://www.lezhinus.com/en/comic/x")).toBe("Lezhin");
    expect(siteName("https://manta.net/en/series/x")).toBe("Manta");
  });

  it("falls back to the given name, then the bare hostname", () => {
    expect(siteName("https://comics.example.com/x", "Example Comics")).toBe("Example Comics");
    expect(siteName("https://www.comics.example.com/x")).toBe("comics.example.com");
  });
});

describe("linksFromMangaDex", () => {
  it("keeps only the official English link", () => {
    expect(
      linksFromMangaDex({
        al: "119257",
        raw: "https://comic.naver.com/webtoon/list?titleId=747269",
        engtl: "https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154",
      }),
    ).toEqual([{ site: "WEBTOON", url: "https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154" }]);
  });

  it("ignores missing, empty, and non-http links", () => {
    expect(linksFromMangaDex(undefined)).toEqual([]);
    expect(linksFromMangaDex(null)).toEqual([]);
    expect(linksFromMangaDex({ engtl: "" })).toEqual([]);
    expect(linksFromMangaDex({ engtl: "javascript:alert(1)" })).toEqual([]);
  });
});

describe("mergeLinks", () => {
  it("keeps the first of each URL, ignoring scheme, www, case, and a trailing slash", () => {
    const merged = mergeLinks(
      [{ site: "WEBTOON", url: "https://www.webtoons.com/en/x/list?title_no=1" }],
      [
        { site: "WEBTOON", url: "http://webtoons.com/en/x/list?title_no=1/" },
        { site: "Tappytoon", url: "https://www.tappytoon.com/en/book/x" },
      ],
    );
    expect(merged).toEqual([
      { site: "WEBTOON", url: "https://www.webtoons.com/en/x/list?title_no=1" },
      { site: "Tappytoon", url: "https://www.tappytoon.com/en/book/x" },
    ]);
  });
});

describe("AniListClient", () => {
  const client = (fetchImpl: typeof fetch) => new AniListClient({ url: ANILIST_URL, userAgent: "Manix-Test/0.0", fetchImpl });

  it("returns English streaming links for a media id", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        data: {
          Media: {
            externalLinks: [
              { site: "Naver Webtoon", url: "https://comic.naver.com/webtoon/list?titleId=747269", language: "Korean", type: "STREAMING" },
              { site: "WEBTOON", url: "https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154", language: "English", type: "STREAMING" },
              { site: "Twitter", url: "https://twitter.com/x", language: "English", type: "SOCIAL" },
              { site: "Bad", url: "ftp://nope", language: "English", type: "STREAMING" },
            ],
          },
        },
      }),
    );

    const links = await client(fetchImpl as unknown as typeof fetch).englishLinks(119257);

    expect(links).toEqual([{ site: "WEBTOON", url: "https://www.webtoons.com/en/action/omniscient-reader/list?title_no=2154" }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ANILIST_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body)).variables).toEqual({ id: 119257 });
    expect((init.headers as Record<string, string>)["User-Agent"]).toBe("Manix-Test/0.0");
  });

  it("returns an empty list when the media has no links", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: { Media: null } }));
    await expect(client(fetchImpl as unknown as typeof fetch).englishLinks(1)).resolves.toEqual([]);
  });

  it("rejects on HTTP errors so callers can retry later", async () => {
    const fetchImpl = vi.fn(async () => new Response("slow down", { status: 429 }));
    await expect(client(fetchImpl as unknown as typeof fetch).englishLinks(1)).rejects.toThrow();
  });
});

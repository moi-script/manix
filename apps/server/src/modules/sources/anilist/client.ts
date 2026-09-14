import type { OfficialLinkDTO } from "@manix/shared";
import { officialLink } from "../official-links";

const REQUEST_TIMEOUT_MS = 4_000;
const QUERY = "query ($id: Int) { Media(id: $id) { externalLinks { site url language type } } }";

interface AniListExternalLink {
  site: string;
  url: string;
  language: string | null;
  type: string | null;
}

interface AniListResponse {
  data?: { Media: { externalLinks: AniListExternalLink[] | null } | null };
}

export interface AniListApi {
  /** Official English reading links for an AniList media id. Rejects on network or HTTP errors. */
  englishLinks(id: number): Promise<OfficialLinkDTO[]>;
}

export interface AniListClientOptions {
  url: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
}

export class AniListClient implements AniListApi {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: AniListClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async englishLinks(id: number): Promise<OfficialLinkDTO[]> {
    const res = await this.fetchImpl(this.options.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": this.options.userAgent,
      },
      body: JSON.stringify({ query: QUERY, variables: { id } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`AniList responded ${res.status}`);

    const body = (await res.json()) as AniListResponse;
    return (body.data?.Media?.externalLinks ?? [])
      .filter((link) => link.type === "STREAMING" && link.language === "English")
      .map((link) => officialLink(link.url, link.site))
      .filter((link): link is OfficialLinkDTO => link !== null);
  }
}

# Official English links for licensed series

## Problem

Licensed manhwa (Solo Leveling: Ragnarok, Tower of God) are taken down from MangaDex, and others
(Omniscient Reader) keep only a few scattered English chapters. Readers hit an empty or gappy chapter
list with nowhere to go. Title search also hides titles with no English chapters, so fully licensed
series can't be found at all.

Manix does not scrape or rehost unlicensed copies. It points readers to the official English
publisher and keeps their place there.

## Design

### Server

- **MangaDex links.** `attributes.links.engtl` is the official English publisher URL. The mapper
  stores it as `mangadexLinks: { site, url }[]` and keeps `links.al` as `anilistId`. Both arrive with
  every manga payload, so search results and library cards get them for free.
- **AniList backup.** On a title *detail* request (`getManga`), if the manga has an `anilistId` and its
  AniList links were last checked more than 7 days ago, query AniList GraphQL for
  `externalLinks { site url language type }` and keep links with `language == "English"` and
  `type == "STREAMING"`. Stored as `anilistLinks` + `anilistCheckedAt`, separate from MangaDex fields so
  a MangaDex refresh (`$set` of the mapped record) never wipes them. 4 s timeout; on failure the page
  uses MangaDex links alone and `anilistCheckedAt` is not advanced.
- **DTO.** `MangaDTO.officialLinks` merges both lists, MangaDex first, de-duplicated by normalized URL.
  Site names come from the hostname (webtoons.com → WEBTOON, tapas.io → Tapas, …), falling back to
  AniList's `site` or the bare hostname.
- **Search.** A text search (`q` present) no longer requires available English chapters, so licensed
  titles can be found by name. Browsing without `q` keeps the filter.
- **Official episode.** `LibraryEntry.officialEpisode: number | null`, exposed as
  `LibraryEntryDTO.officialEpisode`. `PUT /api/library/:mangaId/official-episode { episode }` saves it
  (integer 0–100000) and adds the title to the library as "reading" if it isn't there.

### Web

- **Title page.** A "Read in English officially" panel with one link per official site. Signed-in
  readers get an episode tracker ("I'm on episode [n] [+1]") that saves to the endpoint above. When
  MangaDex has no English chapters, the chapter list's empty message points at the panel.
- **Cards.** `MangaCard` shows an "Official EN" badge when `officialLinks` is non-empty.
- **Library.** Entries with `officialEpisode` show "Episode n · SITE ↗" under the card.

Webtoon has no reliable episode-number deep link (its viewer URL needs a per-episode slug), so links
open the series page and the tracker shows the saved episode.

## Testing

- Server: link extraction and site naming, merge/dedupe, AniList client parsing and failure, catalog
  enrichment caching (no refetch within 7 days, MangaDex refresh keeps AniList links), search filter
  change, official-episode endpoint (validation, upsert as reading, privacy).
- Web: official links panel and tracker, card badge, library episode line, chapter-list empty message.

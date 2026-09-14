import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MangaCard } from "@/components/manga-card";
import { MANGA_ID, sampleManga } from "./fixtures";

describe("MangaCard", () => {
  it("links to the title page with its cover and status", () => {
    render(<MangaCard manga={sampleManga} />);
    const link = screen.getByRole("link", { name: /Solo Leveling/ });
    expect(link).toHaveAttribute("href", `/title/${MANGA_ID}`);
    expect(link.querySelector("img")).toHaveAttribute("src", sampleManga.coverUrl);
    expect(screen.getByText("Completed, 2018")).toBeInTheDocument();
  });

  it("marks titles with an official English release", () => {
    render(<MangaCard manga={{ ...sampleManga, officialLinks: [{ site: "WEBTOON", url: "https://www.webtoons.com/x" }] }} />);
    expect(screen.getByText("Official EN")).toBeInTheDocument();
  });

  it("still renders when an older API omits officialLinks", () => {
    const { officialLinks: _omitted, ...older } = sampleManga;
    render(<MangaCard manga={older as typeof sampleManga} />);
    expect(screen.getByRole("link", { name: /Solo Leveling/ })).toBeInTheDocument();
    expect(screen.queryByText("Official EN")).toBeNull();
  });

  it("has no badge without an official release", () => {
    render(<MangaCard manga={sampleManga} />);
    expect(screen.queryByText("Official EN")).toBeNull();
  });

  it("shows a lettered placeholder when there is no cover", () => {
    render(<MangaCard manga={{ ...sampleManga, id: "other", title: "Untitled Hunter", coverUrl: null, year: null }} />);
    const link = screen.getByRole("link", { name: /Untitled Hunter/ });
    expect(link.querySelector("img")).toBeNull();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });
});

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChapterList } from "@/components/chapter-list";
import { CH1, sampleChapters } from "./fixtures";

describe("ChapterList", () => {
  it("lists chapters newest first with group credits and dates", () => {
    render(<ChapterList chapters={sampleChapters} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Chapter 3");
    expect(items[2]).toHaveTextContent("Chapter 1: The Weakest Hunter");
    expect(items[2]).toHaveTextContent("Alpha Scans, Jan 1, 2024");
    expect(screen.getByRole("link", { name: /Chapter 1: The Weakest Hunter/ })).toHaveAttribute("href", `/read/${CH1}`);
  });

  it("sends external chapters to the publisher's site", () => {
    render(<ChapterList chapters={sampleChapters} />);
    const external = screen.getByRole("link", { name: /Chapter 3/ });
    expect(external).toHaveAttribute("href", "https://publisher.example/solo-leveling/3");
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveTextContent("Read on the publisher's site");
  });

  it("flags chapters missing from MangaDex and links to the official release", () => {
    const partial = [
      { ...sampleChapters[0], id: "late-1", number: "207", title: null },
      { ...sampleChapters[0], id: "late-2", number: "210", title: null },
    ];
    const official = { site: "WEBTOON", url: "https://www.webtoons.com/en/x/list?title_no=1" };
    render(<ChapterList chapters={partial} official={official} />);

    const notice = screen.getByRole("note");
    expect(notice).toHaveTextContent("Chapters 1–206 aren't on MangaDex, usually because the series is licensed.");
    expect(within(notice).getByRole("link", { name: /Read them on WEBTOON/ })).toHaveAttribute("href", official.url);

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Chapter 210"),
      expect.stringContaining("Chapters 208–209 not on MangaDex"),
      expect.stringContaining("Chapter 207"),
      expect.stringContaining("Chapters 1–206 not on MangaDex"),
    ]);
    expect(within(items[1]).getByRole("link", { name: /WEBTOON/ })).toHaveAttribute("href", official.url);
  });

  it("explains gaps without a link when there is no official release", () => {
    render(<ChapterList chapters={[{ ...sampleChapters[0], number: "3", title: null }]} />);
    expect(screen.getByRole("note")).toHaveTextContent("Chapters 1–2 aren't on MangaDex, usually because the series is licensed.");
    expect(screen.queryByRole("link", { name: /Read them/ })).toBeNull();
  });

  it("shows no gap notice when chapters start at 1", () => {
    render(<ChapterList chapters={sampleChapters} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("points to the official release when there are no English chapters", () => {
    render(<ChapterList chapters={[]} official={{ site: "WEBTOON", url: "https://www.webtoons.com/x" }} />);
    expect(screen.getByText("No English chapters are on MangaDex. Read it officially on WEBTOON above.")).toBeInTheDocument();
  });

  it("explains when there are no English chapters", () => {
    render(<ChapterList chapters={[]} />);
    expect(screen.getByText("No English chapters are on MangaDex for this title yet.")).toBeInTheDocument();
  });
});

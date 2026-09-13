import { render, screen } from "@testing-library/react";
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

  it("explains when there are no English chapters", () => {
    render(<ChapterList chapters={[]} />);
    expect(screen.getByText("No English chapters are on MangaDex for this title yet.")).toBeInTheDocument();
  });
});

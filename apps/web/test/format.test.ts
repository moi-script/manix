import { describe, expect, it } from "vitest";
import { chapterLabel, formatDate, groupNames, plainDescription, statusLabel } from "@/lib/format";

describe("format helpers", () => {
  it("labels statuses in plain words", () => {
    expect(statusLabel("ongoing")).toBe("Ongoing");
    expect(statusLabel("hiatus")).toBe("On hiatus");
    expect(statusLabel("mystery")).toBe("");
  });

  it("labels chapters with number and optional title", () => {
    expect(chapterLabel({ number: "12", title: null })).toBe("Chapter 12");
    expect(chapterLabel({ number: "12.5", title: "Side story" })).toBe("Chapter 12.5: Side story");
    expect(chapterLabel({ number: null, title: null })).toBe("Oneshot");
  });

  it("joins group names readably", () => {
    expect(groupNames([])).toBe("No group credited");
    expect(groupNames([{ id: "a", name: "Alpha" }])).toBe("Alpha");
    expect(groupNames([{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }, { id: "c", name: "Gamma" }])).toBe("Alpha, Beta and Gamma");
  });

  it("strips markdown links, emphasis, and rules from descriptions", () => {
    const raw = "A **hunter** rises.\n\n\n---\n[Official](https://example.com) site";
    expect(plainDescription(raw)).toBe("A hunter rises.\n\nOfficial site");
  });

  it("formats dates in UTC", () => {
    expect(formatDate("2024-01-02T23:30:00.000Z")).toBe("Jan 2, 2024");
  });
});

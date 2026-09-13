import type { UserDTO } from "@manix/shared";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContinueReading } from "@/components/continue-reading";
import { CH2, jsonResponse, MANGA_ID, sampleManga, sampleUser } from "./fixtures";

const authState = vi.hoisted(() => ({ user: null as UserDTO | null }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: authState.user, loading: false }),
}));

describe("ContinueReading", () => {
  beforeEach(() => {
    authState.user = null;
  });

  it("renders nothing when signed out", () => {
    const { container } = render(<ContinueReading />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows titles in progress with chapter and page, skipping unavailable titles", async () => {
    authState.user = sampleUser;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          items: [
            { mangaId: MANGA_ID, chapterId: CH2, chapterNumber: "2", page: 4, totalPages: 20, updatedAt: "2024-01-05T00:00:00.000Z", manga: sampleManga },
            { mangaId: "gone", chapterId: "ch-x", chapterNumber: "9", page: 0, totalPages: 10, updatedAt: "2024-01-04T00:00:00.000Z", manga: null },
          ],
        }),
      ),
    );
    render(<ContinueReading />);

    const link = await screen.findByRole("link", { name: /Solo Leveling/ });
    expect(link).toHaveAttribute("href", `/read/${CH2}`);
    expect(link).toHaveTextContent("Chapter 2, page 5 of 20");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Continue reading" })).toBeInTheDocument();
  });
});

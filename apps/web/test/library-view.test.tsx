import type { UserDTO } from "@manix/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryView } from "@/components/library-view";
import { jsonResponse, MANGA_ID, sampleManga, sampleUser } from "./fixtures";

const authState = vi.hoisted(() => ({ user: null as UserDTO | null, loading: false }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

describe("LibraryView", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
  });

  it("asks signed-out visitors to log in", () => {
    render(<LibraryView />);
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Flibrary");
  });

  it("lists saved titles and filters by status", async () => {
    authState.user = sampleUser;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/library") {
          return jsonResponse({ entries: [{ mangaId: MANGA_ID, status: "reading", updatedAt: "2024-01-05T00:00:00.000Z", manga: sampleManga }] });
        }
        if (url === "/api/library?status=completed") return jsonResponse({ entries: [] });
        return jsonResponse({ error: { code: "not_found", message: "x" } }, 404);
      }),
    );
    const user = userEvent.setup();
    render(<LibraryView />);

    expect(await screen.findByRole("link", { name: /Solo Leveling/ })).toHaveAttribute("href", `/title/${MANGA_ID}`);
    await user.click(screen.getByRole("button", { name: "Completed" }));
    expect(await screen.findByText("No titles with this status.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Completed" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the episode reached on the official site", async () => {
    authState.user = sampleUser;
    const manga = { ...sampleManga, officialLinks: [{ site: "WEBTOON", url: "https://www.webtoons.com/en/x/list?title_no=1" }] };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ entries: [{ mangaId: MANGA_ID, status: "reading", officialEpisode: 45, updatedAt: "2024-01-05T00:00:00.000Z", manga }] }),
      ),
    );
    render(<LibraryView />);

    const link = await screen.findByRole("link", { name: /Episode 45 · WEBTOON/ });
    expect(link).toHaveAttribute("href", "https://www.webtoons.com/en/x/list?title_no=1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("invites browsing when nothing is saved", async () => {
    authState.user = sampleUser;
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entries: [] })));
    render(<LibraryView />);
    expect(await screen.findByRole("link", { name: "Browse manhwa" })).toHaveAttribute("href", "/search");
  });
});

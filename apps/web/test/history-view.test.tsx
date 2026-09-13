import type { UserDTO } from "@manix/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryView } from "@/components/history-view";
import { jsonResponse, MANGA_ID, sampleManga, sampleUser } from "./fixtures";

const authState = vi.hoisted(() => ({ user: null as UserDTO | null, loading: false }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

const entry = (n: number) => ({
  mangaId: MANGA_ID,
  chapterId: `ch-${n}`,
  readAt: `2024-01-${String(10 - n).padStart(2, "0")}T00:00:00.000Z`,
  manga: sampleManga,
});

describe("HistoryView", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
  });

  it("asks signed-out visitors to log in", () => {
    render(<HistoryView />);
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?next=%2Fhistory");
  });

  it("shows recent chapters and loads older history on request", async () => {
    authState.user = sampleUser;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/history?page=1") return jsonResponse({ items: [entry(1), entry(2)], total: 3, page: 1, pageSize: 2 });
        if (url === "/api/history?page=2") return jsonResponse({ items: [entry(3)], total: 3, page: 2, pageSize: 2 });
        return jsonResponse({ error: { code: "not_found", message: "x" } }, 404);
      }),
    );
    const user = userEvent.setup();
    render(<HistoryView />);

    const first = await screen.findAllByRole("link", { name: /Solo Leveling/ });
    expect(first).toHaveLength(2);
    expect(first[0]).toHaveAttribute("href", "/read/ch-1");
    expect(first[0]).toHaveTextContent("Read Jan 9, 2024");

    await user.click(screen.getByRole("button", { name: "Show older history" }));
    expect(await screen.findAllByRole("link", { name: /Solo Leveling/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Show older history" })).toBeNull();
  });

  it("explains an empty history", async () => {
    authState.user = sampleUser;
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ items: [], total: 0, page: 1, pageSize: 50 })));
    render(<HistoryView />);
    expect(await screen.findByText("Chapters you open show up here.")).toBeInTheDocument();
  });
});

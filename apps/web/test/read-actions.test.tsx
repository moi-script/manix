import type { UserDTO } from "@manix/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadActions } from "@/components/read-actions";
import { CH1, CH2, jsonResponse, MANGA_ID, sampleUser } from "./fixtures";

const authState = vi.hoisted(() => ({ user: null as UserDTO | null, loading: false }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

describe("ReadActions", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
  });

  it("offers to start reading and to log in when signed out", () => {
    render(<ReadActions mangaId={MANGA_ID} firstChapterId={CH1} />);
    expect(screen.getByRole("link", { name: "Start reading" })).toHaveAttribute("href", `/read/${CH1}`);
    expect(screen.getByRole("link", { name: "Log in to save this to your library" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/title/${MANGA_ID}`)}`,
    );
  });

  it("says so when there is nothing to read", () => {
    render(<ReadActions mangaId={MANGA_ID} firstChapterId={null} />);
    expect(screen.getByText("No chapters to read here yet")).toBeInTheDocument();
  });

  it("continues from saved progress and shows the saved library status", async () => {
    authState.user = sampleUser;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `/api/progress/${MANGA_ID}`) {
          return jsonResponse({
            progress: { mangaId: MANGA_ID, chapterId: CH2, chapterNumber: "2", page: 4, totalPages: 20, updatedAt: "2024-01-05T00:00:00.000Z", manga: null },
          });
        }
        if (url === `/api/library/${MANGA_ID}`) {
          return jsonResponse({ entry: { mangaId: MANGA_ID, status: "reading", updatedAt: "2024-01-05T00:00:00.000Z", manga: null } });
        }
        return jsonResponse({ error: { code: "not_found", message: "x" } }, 404);
      }),
    );

    render(<ReadActions mangaId={MANGA_ID} firstChapterId={CH1} />);
    expect(await screen.findByRole("link", { name: "Continue chapter 2" })).toHaveAttribute("href", `/read/${CH2}`);
    expect(screen.getByRole("combobox", { name: "Library" })).toHaveValue("reading");
  });

  it("saves a library status change", async () => {
    authState.user = sampleUser;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/progress/${MANGA_ID}`) return jsonResponse({ progress: null });
      if (url === `/api/library/${MANGA_ID}` && (init?.method ?? "GET") === "GET") return jsonResponse({ entry: null });
      if (url === `/api/library/${MANGA_ID}` && init?.method === "PUT") {
        return jsonResponse({ entry: { mangaId: MANGA_ID, status: "plan", updatedAt: "2024-01-05T00:00:00.000Z", manga: null } });
      }
      return jsonResponse({ error: { code: "not_found", message: "x" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ReadActions mangaId={MANGA_ID} firstChapterId={CH1} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));

    await user.selectOptions(screen.getByRole("combobox", { name: "Library" }), "plan");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/library/${MANGA_ID}`,
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ status: "plan" }) }),
      ),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});

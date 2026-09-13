import type { UserDTO } from "@manix/shared";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_DEBOUNCE_MS, Reader } from "@/components/reader";
import { PREFS_KEY } from "@/lib/prefs";
import { CH1, CH2, jsonResponse, MANGA_ID, sampleChapterDetail, sampleManga, sampleUser } from "./fixtures";

const mocks = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), user: null as UserDTO | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, prefetch: mocks.prefetch, refresh: vi.fn() }),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

function stubApi(override: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const custom = override(url, init);
    if (custom) return custom;
    const match = /^\/api\/chapters\/([^/]+)\/pages\?quality=(data|data-saver)$/.exec(url);
    if (match) {
      const [, id, quality] = match;
      return jsonResponse({ chapterId: id, quality, pages: [`/img/ch/${id}/${quality}/1-a.png`, `/img/ch/${id}/${quality}/2-b.png`] });
    }
    if (url === "/api/progress") return jsonResponse({ progress: {} });
    return jsonResponse({ error: { code: "not_found", message: "Route not found" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const callsTo = (fetchMock: ReturnType<typeof stubApi>, url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url);

describe("Reader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows every page in long-strip mode with the group credit and chapter links", async () => {
    stubApi();
    render(<Reader chapter={sampleChapterDetail} manga={sampleManga} />);

    const images = await screen.findAllByRole("img", { name: /^Page \d of 2$/ });
    expect(images.map((img) => img.getAttribute("src"))).toEqual([`/img/ch/${CH1}/data/1-a.png`, `/img/ch/${CH1}/data/2-b.png`]);
    expect(screen.getAllByText(/Translated by Alpha Scans/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Next chapter" })).toHaveAttribute("href", `/read/${CH2}`);
    expect(screen.getByRole("link", { name: sampleManga.title })).toHaveAttribute("href", `/title/${MANGA_ID}`);
  });

  it("warms the next chapter when the reader is near the end", async () => {
    const fetchMock = stubApi();
    render(<Reader chapter={sampleChapterDetail} manga={sampleManga} />);
    await screen.findAllByRole("img", { name: /^Page \d of 2$/ });

    await waitFor(() => expect(mocks.prefetch).toHaveBeenCalledWith(`/read/${CH2}`));
    expect(callsTo(fetchMock, `/api/chapters/${CH2}/pages?quality=data`)).toHaveLength(1);
  });

  it("uses data-saver images when that preference is on", async () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: "strip", dataSaver: true }));
    const fetchMock = stubApi();
    render(<Reader chapter={sampleChapterDetail} manga={sampleManga} />);

    await screen.findAllByRole("img", { name: /^Page \d of 2$/ });
    expect(callsTo(fetchMock, `/api/chapters/${CH1}/pages?quality=data-saver`)).toHaveLength(1);
    expect(callsTo(fetchMock, `/api/chapters/${CH1}/pages?quality=data`)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Data saver" })).toHaveAttribute("aria-pressed", "true");
  });

  it("turns pages with the keyboard in page-by-page mode and moves to the next chapter", async () => {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: "paged", dataSaver: false }));
    stubApi();
    render(<Reader chapter={sampleChapterDetail} manga={sampleManga} />);

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(mocks.push).toHaveBeenCalledWith(`/read/${CH2}`);
  });

  it("saves reading progress after a pause when signed in", async () => {
    mocks.user = sampleUser;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubApi();
    render(<Reader chapter={sampleChapterDetail} manga={sampleManga} />);
    await screen.findAllByRole("img", { name: /^Page \d of 2$/ });
    expect(callsTo(fetchMock, "/api/progress")).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS);
    });

    await waitFor(() => expect(callsTo(fetchMock, "/api/progress")).toHaveLength(1));
    const [, init] = callsTo(fetchMock, "/api/progress")[0] as [string, RequestInit];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ mangaId: MANGA_ID, chapterId: CH1, chapterNumber: "1", page: 0, totalPages: 2 });
  });

  it("does not save progress when signed out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = stubApi();
    render(<Reader chapter={sampleChapterDetail} manga={sampleManga} />);
    await screen.findAllByRole("img", { name: /^Page \d of 2$/ });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROGRESS_DEBOUNCE_MS * 2);
    });
    expect(callsTo(fetchMock, "/api/progress")).toHaveLength(0);
  });

  it("offers a retry when pages fail to load", async () => {
    let failuresLeft = 1;
    stubApi((url) => {
      if (url.startsWith(`/api/chapters/${CH1}/pages`) && failuresLeft > 0) {
        failuresLeft -= 1;
        return jsonResponse({ error: { code: "source_unavailable", message: "busy" } }, 502);
      }
      return undefined;
    });
    const user = userEvent.setup();
    render(<Reader chapter={sampleChapterDetail} manga={sampleManga} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("This chapter's pages didn't load.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("img", { name: /^Page \d of 2$/ })).toHaveLength(2);
  });

  it("explains rate limiting in plain words", async () => {
    stubApi((url) =>
      url.startsWith(`/api/chapters/${CH1}/pages`)
        ? jsonResponse({ error: { code: "rate_limited", message: "Too many chapters opened, slow down" } }, 429)
        : undefined,
    );
    render(<Reader chapter={sampleChapterDetail} manga={sampleManga} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("You're opening chapters quickly. Wait a moment, then try again.");
  });
});

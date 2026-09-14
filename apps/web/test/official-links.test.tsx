import type { UserDTO } from "@manix/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OfficialLinks } from "@/components/official-links";
import { jsonResponse, MANGA_ID, sampleUser } from "./fixtures";

const authState = vi.hoisted(() => ({ user: null as UserDTO | null, loading: false }));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: authState.user, loading: authState.loading }),
}));

const WEBTOON = "https://www.webtoons.com/en/action/solo/list?title_no=1";
const TAPAS = "https://tapas.io/series/solo/info";
const links = [
  { site: "WEBTOON", url: WEBTOON },
  { site: "Tapas", url: TAPAS },
];

function entry(officialEpisode: number | null) {
  return { mangaId: MANGA_ID, status: "reading", officialEpisode, updatedAt: "2024-01-05T00:00:00.000Z", manga: null };
}

describe("OfficialLinks", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
  });

  it("links to each official English site in a new tab", () => {
    render(<OfficialLinks mangaId={MANGA_ID} links={links} />);
    expect(screen.getByRole("heading", { name: "Read in English officially" })).toBeInTheDocument();
    const webtoon = screen.getByRole("link", { name: /WEBTOON/ });
    expect(webtoon).toHaveAttribute("href", WEBTOON);
    expect(webtoon).toHaveAttribute("target", "_blank");
    expect(webtoon).toHaveAttribute("rel", "noreferrer");
    expect(screen.getByRole("link", { name: /Tapas/ })).toHaveAttribute("href", TAPAS);
  });

  it("renders nothing without links", () => {
    const { container } = render(<OfficialLinks mangaId={MANGA_ID} links={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("invites signed-out visitors to log in to track their episode", () => {
    render(<OfficialLinks mangaId={MANGA_ID} links={links} />);
    expect(screen.getByRole("link", { name: "Log in to track your episode" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/title/${MANGA_ID}`)}`,
    );
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("shows the saved episode and saves +1", async () => {
    authState.user = sampleUser;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/library/${MANGA_ID}` && init?.method === "GET") return jsonResponse({ entry: entry(45) });
      if (url === `/api/library/${MANGA_ID}/official-episode` && init?.method === "PUT") {
        return jsonResponse({ entry: entry(JSON.parse(String(init.body)).episode) });
      }
      return jsonResponse({ error: { code: "not_found", message: "x" } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<OfficialLinks mangaId={MANGA_ID} links={links} />);

    const input = await screen.findByRole("spinbutton", { name: "Episode you're on" });
    await waitFor(() => expect(input).toHaveValue(45));

    await user.click(screen.getByRole("button", { name: "+1" }));
    expect(input).toHaveValue(46);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(put?.[1]?.body))).toEqual({ episode: 46 });
  });

  it("saves a typed episode on Enter and reverts on failure", async () => {
    authState.user = sampleUser;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === "PUT"
          ? jsonResponse({ error: { code: "server_error", message: "x" } }, 500)
          : jsonResponse({ entry: null }),
      ),
    );
    const user = userEvent.setup();
    render(<OfficialLinks mangaId={MANGA_ID} links={links} />);

    const input = await screen.findByRole("spinbutton", { name: "Episode you're on" });
    expect(input).toHaveValue(null);
    await user.type(input, "12{Enter}");
    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument();
    expect(input).toHaveValue(null);
  });
});

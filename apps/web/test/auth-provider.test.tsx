import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import { jsonResponse, sampleUser } from "./fixtures";

function Probe() {
  const { user, loading, login, logout } = useAuth();
  return (
    <div>
      <p>{loading ? "loading" : user ? `signed in as ${user.username}` : "signed out"}</p>
      <button type="button" onClick={() => void login("reader@example.com", "password123")}>
        login
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

const unauthorized = () => jsonResponse({ error: { code: "unauthorized", message: "Login required" } }, 401);

describe("AuthProvider", () => {
  it("loads the signed-in user on mount", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => (String(input) === "/api/auth/me" ? jsonResponse({ user: sampleUser }) : unauthorized())),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText("signed in as reader_1")).toBeInTheDocument();
  });

  it("is signed out when there is no session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => unauthorized()));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(await screen.findByText("signed out")).toBeInTheDocument();
  });

  it("logs in and logs out", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/login") return jsonResponse({ user: sampleUser });
      if (url === "/api/auth/logout") return new Response(null, { status: 204 });
      void init;
      return unauthorized();
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("signed out");

    await user.click(screen.getByRole("button", { name: "login" }));
    expect(await screen.findByText("signed in as reader_1")).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(([u]) => String(u) === "/api/auth/login")!;
    expect(JSON.parse(String((loginCall[1] as RequestInit).body))).toEqual({ email: "reader@example.com", password: "password123" });

    await user.click(screen.getByRole("button", { name: "logout" }));
    expect(await screen.findByText("signed out")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth-provider";
import { SiteHeader } from "@/components/site-header";
import { jsonResponse } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("SiteHeader", () => {
  it("keeps nav links and the auth control on one line so nothing wraps at phone widths", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "unauthorized", message: "Login required" } }, 401)));
    render(
      <AuthProvider>
        <SiteHeader />
      </AuthProvider>,
    );

    for (const name of ["Browse", "Library", "History"]) {
      expect(screen.getByRole("link", { name })).toHaveClass("whitespace-nowrap");
    }

    expect(await screen.findByRole("link", { name: "Log in" })).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveClass("whitespace-nowrap");
  });
});

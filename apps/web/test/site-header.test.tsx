import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/components/auth-provider";
import { SiteHeader } from "@/components/site-header";
import { jsonResponse } from "./fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("SiteHeader", () => {
  it("links to every destination, signed out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: { code: "unauthorized", message: "Login required" } }, 401)));
    render(
      <AuthProvider>
        <SiteHeader />
      </AuthProvider>,
    );

    expect(screen.getByRole("link", { name: "Browse" })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/library");
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/history");
    expect(await screen.findByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
  });
});

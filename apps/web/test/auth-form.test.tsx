import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/auth-form";
import { ApiError } from "@/lib/api";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), next: "/library" as string | null }));
const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  useSearchParams: () => new URLSearchParams(nav.next ? `next=${encodeURIComponent(nav.next)}` : ""),
}));

vi.mock("@/components/auth-provider", () => ({
  useAuth: () => ({ user: null, loading: false, login: auth.login, register: auth.register, logout: vi.fn() }),
}));

describe("AuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.next = "/library";
  });

  it("logs in and returns to the requested page", async () => {
    auth.login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText("Email"), "reader@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(auth.login).toHaveBeenCalledWith("reader@example.com", "password123");
    expect(nav.push).toHaveBeenCalledWith("/library");
  });

  it("shows a readable message when the credentials are wrong", async () => {
    auth.login.mockRejectedValue(new ApiError(401, "invalid_credentials", "Invalid email or password"));
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText("Email"), "reader@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don't match an account.");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("registers with a username and goes home when no next page is given", async () => {
    nav.next = null;
    auth.register.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AuthForm mode="register" />);

    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Username"), "new_reader");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(auth.register).toHaveBeenCalledWith("new@example.com", "new_reader", "password123");
    expect(nav.push).toHaveBeenCalledWith("/");
  });

  it("ignores next values that leave the site", async () => {
    nav.next = "https://evil.example";
    auth.login.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AuthForm mode="login" />);

    await user.type(screen.getByLabelText("Email"), "reader@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(nav.push).toHaveBeenCalledWith("/");
  });
});

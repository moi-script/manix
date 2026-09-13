import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";

describe("SiteFooter", () => {
  it("credits MangaDex and links to removal requests", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: "MangaDex" })).toHaveAttribute("href", "https://mangadex.org");
    expect(screen.getByRole("link", { name: "About and removal requests" })).toHaveAttribute("href", "/about");
  });
});

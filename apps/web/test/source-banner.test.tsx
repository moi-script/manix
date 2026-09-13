import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SourceBanner } from "@/components/source-banner";
import { jsonResponse } from "./fixtures";

describe("SourceBanner", () => {
  it("warns when MangaDex is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ok: true, sourceAvailable: false })));
    render(<SourceBanner />);
    expect(await screen.findByRole("status")).toHaveTextContent("MangaDex isn't responding");
  });

  it("stays hidden when MangaDex is available", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true, sourceAvailable: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SourceBanner />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/health"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

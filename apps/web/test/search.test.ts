import { describe, expect, it } from "vitest";
import { lastPage, pageHref, readSearchParams, toApiQuery } from "@/lib/search";

describe("search params", () => {
  it("defaults to Korean titles on page 1", () => {
    expect(readSearchParams({})).toEqual({ q: "", status: "", origin: "ko", order: "", page: 1 });
  });

  it("keeps known values and drops unknown ones", () => {
    expect(readSearchParams({ q: "  solo ", status: "bogus", origin: "any", order: "rating", page: "3" })).toEqual({
      q: "solo",
      status: "",
      origin: "any",
      order: "rating",
      page: 3,
    });
    expect(readSearchParams({ page: "-2", q: ["first", "second"], origin: "xx" })).toMatchObject({ page: 1, q: "first", origin: "ko" });
  });

  it("builds the API query, omitting empty filters and 'any' origin", () => {
    expect(toApiQuery({ q: "solo leveling", status: "completed", origin: "any", order: "", page: 2 })).toBe(
      "q=solo+leveling&status=completed&page=2",
    );
    expect(toApiQuery(readSearchParams({}))).toBe("origin=ko&page=1");
  });

  it("builds page links that keep the filters", () => {
    expect(pageHref({ q: "solo", status: "", origin: "ko", order: "", page: 1 }, 2)).toBe("/search?q=solo&origin=ko&page=2");
    expect(pageHref(readSearchParams({}), 1)).toBe("/search?origin=ko");
  });

  it("caps the last page at the source's 10,000 result window", () => {
    expect(lastPage(0, 24)).toBe(1);
    expect(lastPage(50, 24)).toBe(3);
    expect(lastPage(10_000, 24)).toBe(416);
  });
});

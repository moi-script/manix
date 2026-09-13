import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, loadPrefs, PREFS_KEY, savePrefs } from "@/lib/prefs";

describe("reader prefs", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadPrefs(window.localStorage)).toEqual(DEFAULT_PREFS);
  });

  it("round-trips saved prefs", () => {
    savePrefs({ mode: "paged", dataSaver: true }, window.localStorage);
    expect(loadPrefs(window.localStorage)).toEqual({ mode: "paged", dataSaver: true });
  });

  it("ignores malformed or unexpected stored values", () => {
    window.localStorage.setItem(PREFS_KEY, "{not json");
    expect(loadPrefs(window.localStorage)).toEqual(DEFAULT_PREFS);
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: "sideways", dataSaver: "yes" }));
    expect(loadPrefs(window.localStorage)).toEqual(DEFAULT_PREFS);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(loadPrefs(broken)).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs({ mode: "paged", dataSaver: false }, broken)).not.toThrow();
  });
});

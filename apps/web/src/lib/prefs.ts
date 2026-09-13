export interface ReaderPrefs {
  mode: "strip" | "paged";
  dataSaver: boolean;
}

export const DEFAULT_PREFS: ReaderPrefs = { mode: "strip", dataSaver: false };
export const PREFS_KEY = "manix:reader-prefs";

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadPrefs(storage: Storage | undefined = browserStorage()): ReaderPrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ReaderPrefs>;
    return {
      mode: parsed.mode === "paged" ? "paged" : "strip",
      dataSaver: parsed.dataSaver === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: ReaderPrefs, storage: Storage | undefined = browserStorage()): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage is full or blocked; prefs just won't persist.
  }
}

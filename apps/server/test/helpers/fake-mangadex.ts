import { vi } from "vitest";
import { MangaDexError, type MangaDexApi, type Query } from "../../src/modules/sources/mangadex/client";
import type { MdAtHomeResponse } from "../../src/modules/sources/mangadex/types";

export function fakeMangaDex(
  handlers: Record<string, unknown> = {},
  atHomeResponses: Record<string, MdAtHomeResponse | Error> = {},
) {
  const get = vi.fn(async (path: string, query: Query = {}) => {
    const handler = handlers[path];
    if (handler === undefined) throw new MangaDexError(404, `No fake handler for ${path}`);
    if (handler instanceof Error) throw handler;
    if (typeof handler === "function") return (handler as (q: Query) => unknown)(query);
    return structuredClone(handler);
  });

  const getAtHome = vi.fn(async (chapterId: string) => {
    const response = atHomeResponses[chapterId];
    if (response === undefined) throw new MangaDexError(404, `No fake at-home for ${chapterId}`);
    if (response instanceof Error) throw response;
    return structuredClone(response);
  });

  const isAvailable = vi.fn(() => true);
  const api = { get, getAtHome, isAvailable } as unknown as MangaDexApi;
  return { api, get, getAtHome, isAvailable, handlers, atHomeResponses };
}

export type FakeMangaDex = ReturnType<typeof fakeMangaDex>;

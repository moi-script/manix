import type { ApiErrorBody } from "@manix/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

const NO_REFRESH_PATHS = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/auth/logout"];

export async function parseApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // Non-JSON error body (e.g. a proxy error page).
  }
  return new ApiError(
    res.status,
    body.error?.code ?? "http_error",
    body.error?.message ?? `Request failed with status ${res.status}`,
  );
}

let refreshInFlight: Promise<boolean> | null = null;

/** Concurrent callers share one refresh request. */
export function refreshSession(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetchImpl("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, options: RequestOptions = {}, fetchImpl: typeof fetch = fetch): Promise<T> {
  const hasBody = options.body !== undefined;
  const send = () =>
    fetchImpl(path, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

  let res = await send();
  if (res.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    if (await refreshSession(fetchImpl)) res = await send();
  }
  if (!res.ok) throw await parseApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

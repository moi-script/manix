export interface Option {
  value: string;
  label: string;
}

export interface SearchFormValues {
  q: string;
  status: string;
  origin: string;
  order: string;
  page: number;
}

export const ORIGIN_OPTIONS: Option[] = [
  { value: "ko", label: "Korean (manhwa)" },
  { value: "ja", label: "Japanese (manga)" },
  { value: "zh", label: "Chinese (manhua)" },
  { value: "any", label: "Any origin" },
];

export const STATUS_OPTIONS: Option[] = [
  { value: "", label: "Any status" },
  { value: "ongoing", label: "Ongoing" },
  { value: "completed", label: "Completed" },
  { value: "hiatus", label: "On hiatus" },
  { value: "cancelled", label: "Cancelled" },
];

export const ORDER_OPTIONS: Option[] = [
  { value: "", label: "Best match" },
  { value: "followedCount", label: "Most followed" },
  { value: "latestUploadedChapter", label: "Recently updated" },
  { value: "createdAt", label: "Newest" },
  { value: "rating", label: "Top rated" },
];

const MAX_RESULT_WINDOW = 10_000;

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function oneOf(value: string, options: Option[], fallback: string): string {
  return options.some((o) => o.value === value) ? value : fallback;
}

export function readSearchParams(params: RawParams): SearchFormValues {
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).slice(0, 200),
    status: oneOf(first(params.status), STATUS_OPTIONS, ""),
    origin: oneOf(first(params.origin), ORIGIN_OPTIONS, "ko"),
    order: oneOf(first(params.order), ORDER_OPTIONS, ""),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

export function toApiQuery(values: SearchFormValues): string {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.status) params.set("status", values.status);
  if (values.origin !== "any") params.set("origin", values.origin);
  if (values.order) params.set("order", values.order);
  params.set("page", String(values.page));
  return params.toString();
}

export function pageHref(values: SearchFormValues, page: number): string {
  const params = new URLSearchParams();
  if (values.q) params.set("q", values.q);
  if (values.status) params.set("status", values.status);
  params.set("origin", values.origin);
  if (values.order) params.set("order", values.order);
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

export function lastPage(total: number, pageSize: number): number {
  return Math.max(1, Math.min(Math.ceil(total / pageSize), Math.floor(MAX_RESULT_WINDOW / pageSize)));
}

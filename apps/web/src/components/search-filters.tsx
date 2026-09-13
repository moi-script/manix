import Form from "next/form";
import { ORDER_OPTIONS, ORIGIN_OPTIONS, STATUS_OPTIONS, type Option, type SearchFormValues } from "@/lib/search";

const control = "rounded-sm border border-rule bg-gutter px-3 py-2 text-sm text-paper";

function Select({ name, label, options, value }: { name: string; label: string; options: Option[]; value: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-dusk">
      {label}
      <select name={name} defaultValue={value} className={control}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SearchFilters({ values }: { values: SearchFormValues }) {
  return (
    <Form
      action="/search"
      role="search"
      className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-end"
    >
      <label className="flex flex-col gap-1 text-xs text-dusk">
        Title
        <input name="q" type="search" defaultValue={values.q} placeholder="Solo Leveling, Tower of God" className={control} />
      </label>
      <Select name="origin" label="Origin" options={ORIGIN_OPTIONS} value={values.origin} />
      <Select name="status" label="Status" options={STATUS_OPTIONS} value={values.status} />
      <Select name="order" label="Sort by" options={ORDER_OPTIONS} value={values.order} />
      <button type="submit" className="rounded-sm bg-marker px-5 py-2 text-sm font-medium text-ink">
        Search
      </button>
    </Form>
  );
}

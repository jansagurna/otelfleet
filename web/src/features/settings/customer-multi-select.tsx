import { Skeleton } from '@/components/ui/skeleton'
import type { Customer } from '@/api/generated'

/**
 * Checkbox list for granting a user tenant-scoped access to specific customers.
 * An empty selection means "all customers" (backward compatible) — the helper
 * copy lives with the consumer so it can match the surrounding form.
 */
export function CustomerMultiSelect({
  customers,
  selected,
  onChange,
  disabled = false,
  isLoading = false,
  isError = false,
  namePrefix,
}: {
  customers: Customer[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  isLoading?: boolean
  isError?: boolean
  /** Distinguishes the checkbox group from any other on the page. */
  namePrefix: string
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <p className="text-xs text-danger">Could not load customers.</p>
  }

  if (customers.length === 0) {
    return <p className="text-xs text-ink-3">No customers yet.</p>
  }

  const toggle = (id: string, checked: boolean) => {
    if (checked) onChange([...selected, id])
    else onChange(selected.filter((value) => value !== id))
  }

  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-line p-1.5">
      {customers.map((customer) => (
        <label
          key={customer.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2 has-checked:bg-accent/5"
        >
          <input
            type="checkbox"
            name={`${namePrefix}-customer`}
            value={customer.id}
            checked={selected.includes(customer.id)}
            disabled={disabled}
            onChange={(e) => toggle(customer.id, e.target.checked)}
            className="accent-(--accent)"
          />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium text-ink">{customer.name}</span>
            <span className="truncate font-mono text-xs text-ink-3">{customer.slug}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

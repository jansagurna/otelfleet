import { cn } from '@/lib/utils'

/** Minimal hand-rolled switch (no extra Radix dep) styled on the token system. */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  className,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  'aria-label'?: string
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full border border-line p-px transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-surface-2',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'block size-3.5 rounded-full shadow-sm transition-transform',
          checked ? 'translate-x-3.5 bg-accent-contrast' : 'translate-x-0 bg-ink-3',
        )}
      />
    </button>
  )
}

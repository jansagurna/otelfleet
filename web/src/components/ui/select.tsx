import { forwardRef, type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Styled native select — keeps the dependency footprint lean. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <span className={cn('relative inline-flex w-full', className)}>
      <select
        ref={ref}
        className="h-8 w-full cursor-pointer appearance-none rounded-md border border-line bg-transparent pr-7 pl-2.5 text-[13px] text-ink transition-colors outline-none focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-surface [&>option]:text-ink"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-ink-3"
      />
    </span>
  ),
)
Select.displayName = 'Select'

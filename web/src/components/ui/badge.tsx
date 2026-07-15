import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-[11px] font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-line bg-surface-2 text-ink-2',
        ok: 'border-ok/30 bg-ok/10 text-ok',
        warn: 'border-warn/40 bg-warn/10 text-warn',
        danger: 'border-danger/40 bg-danger/10 text-danger',
        accent: 'border-accent/40 bg-accent/10 text-accent',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Renders the little status dot before the label. */
  dot?: boolean
}

export function Badge({ className, variant, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

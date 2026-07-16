import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ComponentPropsWithoutRef } from 'react'

/** Right-side panel built on the existing Radix dialog dependency. */
export const Sheet = DialogPrimitive.Root
export const SheetClose = DialogPrimitive.Close

export function SheetContent({
  className,
  children,
  title,
  description,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  title: string
  description?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-line bg-surface shadow-2xl outline-none',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5">
          <div className="flex flex-col gap-0.5">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-xs text-ink-2">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="rounded-md p-1 text-ink-3 transition-colors outline-none hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/70"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

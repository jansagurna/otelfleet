import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Minimal module-level toast bus — enough for "saved"/"activated" feedback
 * without pulling in a toast library. `toast()` can be called from anywhere;
 * the single <Toaster /> mounted in the auth layout renders the stack.
 */
export interface ToastItem {
  id: number
  message: string
  variant: 'ok' | 'danger'
}

type Listener = (item: ToastItem) => void

let nextId = 1
const listeners = new Set<Listener>()

export function toast(message: string, variant: 'ok' | 'danger' = 'ok'): void {
  const item: ToastItem = { id: nextId++, message, variant }
  for (const listener of listeners) listener(item)
}

const TOAST_TTL_MS = 4000

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const listener: Listener = (item) => {
      setItems((current) => [...current, item])
      const timer = setTimeout(() => {
        setItems((current) => current.filter((t) => t.id !== item.id))
        timers.delete(timer)
      }, TOAST_TTL_MS)
      timers.add(timer)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed right-4 bottom-4 z-[70] flex w-72 flex-col gap-2"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'flex items-center gap-2 rounded-md border bg-surface px-3 py-2.5 text-[13px] text-ink shadow-xl',
            item.variant === 'ok' ? 'border-ok/40' : 'border-danger/40',
          )}
        >
          {item.variant === 'ok' ? (
            <CheckCircle2 className="size-4 shrink-0 text-ok" />
          ) : (
            <XCircle className="size-4 shrink-0 text-danger" />
          )}
          <span className="min-w-0 flex-1">{item.message}</span>
        </div>
      ))}
    </div>
  )
}

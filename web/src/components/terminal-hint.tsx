import { CopyButton } from '@/components/copy-button'

/**
 * The signature empty state: a terminal-voice, copy-pasteable command block.
 * Empty screens are an invitation to act — hand the operator the exact
 * command that produces data.
 */
export function TerminalHint({
  title,
  body,
  command,
}: {
  title: string
  body: string
  command: string
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <div aria-hidden className="flex items-end gap-1 opacity-60">
        <span className="h-2 w-1.5 rounded-[1px] bg-ink-3" />
        <span className="h-3.5 w-1.5 rounded-[1px] bg-ink-3" />
        <span className="h-5 w-1.5 rounded-[1px] bg-accent" />
      </div>
      <div>
        <div className="text-sm font-semibold text-ink">{title}</div>
        <div className="mt-1 max-w-md text-[13px] text-ink-2">{body}</div>
      </div>
      <div className="flex w-full max-w-2xl items-start gap-1 rounded-md border border-line bg-surface-2 p-3 text-left">
        <code className="min-w-0 flex-1 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-ink-2">
          <span aria-hidden className="text-accent select-none">
            ${' '}
          </span>
          {command}
        </code>
        <CopyButton value={command} label="Copy command" />
      </div>
    </div>
  )
}

export const TELEMETRYGEN_COMMAND =
  'telemetrygen logs --otlp-insecure --otlp-endpoint localhost:4317 --otlp-header \'authorization="Bearer <key>"\''

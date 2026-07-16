import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { yaml } from '@codemirror/lang-yaml'
import { syntaxHighlighting } from '@codemirror/language'
import { classHighlighter } from '@lezer/highlight'
import { cn } from '@/lib/utils'

/**
 * Read-only CodeMirror YAML viewer. Token colors come from `.tok-*` rules in
 * styles.css (via classHighlighter) so they follow the light/dark tokens.
 */
const viewerTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '12px',
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
    padding: '10px 0',
    caretColor: 'transparent',
  },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--ink-3)',
    fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
    paddingLeft: '4px',
  },
  '&.cm-focused': { outline: 'none' },
})

export function YamlView({ value, className }: { value: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialValueRef = useRef(value)
  initialValueRef.current = value

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          lineNumbers(),
          yaml(),
          syntaxHighlighting(classHighlighter),
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.lineWrapping,
          viewerTheme,
        ],
      }),
    })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      data-testid="yaml-view"
      className={cn('overflow-auto rounded-md border border-line bg-surface-2', className)}
    />
  )
}

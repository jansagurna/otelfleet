/**
 * Maps ValidationResult error paths (e.g. "exporters[0].config.endpoint")
 * onto builder cards so an error can scroll to and flash its source.
 */
export interface ErrorAnchor {
  section: 'signals' | 'processors' | 'exporters'
  /** Node index within the section; null for section-level errors (signals). */
  index: number | null
}

const PATH_PATTERN = /^(signals|processors|exporters)(?:\[(\d+)\])?/

export function parseErrorPath(path: string | null | undefined): ErrorAnchor | null {
  if (!path) return null
  const match = PATH_PATTERN.exec(path.trim())
  if (!match) return null
  const section = match[1] as ErrorAnchor['section']
  const index = match[2] === undefined ? null : Number(match[2])
  if (section === 'signals') return { section, index: null }
  return { section, index }
}

/** Stable DOM id for the builder card an anchor points at. */
export function anchorDomId(anchor: ErrorAnchor): string {
  if (anchor.section === 'signals' || anchor.index === null) {
    return `pipeline-${anchor.section}`
  }
  return `pipeline-node-${anchor.section}-${anchor.index}`
}

const FLASH_CLASSES = ['ring-2', 'ring-danger', 'border-danger/60']
const FLASH_MS = 1800

/** Scroll the anchored card into view and flash a red ring on it. */
export function flashAnchor(anchor: ErrorAnchor): void {
  const el = document.getElementById(anchorDomId(anchor))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add(...FLASH_CLASSES)
  window.setTimeout(() => el.classList.remove(...FLASH_CLASSES), FLASH_MS)
}

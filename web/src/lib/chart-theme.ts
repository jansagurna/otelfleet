import type { Theme } from '@/lib/theme'
import type { Signal } from '@/api/generated'

/**
 * Chart chrome + series colors from the validated dataviz palette.
 * Dark is a selected mode (its own steps), not an automatic flip.
 */
export interface ChartInk {
  surface: string
  grid: string
  axisLine: string
  label: string
  tooltipBg: string
  tooltipBorder: string
  tooltipText: string
  crosshair: string
}

export const CHART_INK: Record<Theme, ChartInk> = {
  light: {
    surface: '#fcfcfb',
    grid: '#e1e0d9',
    axisLine: '#c3c2b7',
    label: '#898781',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(11, 11, 11, 0.10)',
    tooltipText: '#0b0b0b',
    crosshair: '#898781',
  },
  dark: {
    surface: '#1a1a19',
    grid: '#2c2c2a',
    axisLine: '#383835',
    label: '#898781',
    tooltipBg: '#232322',
    tooltipBorder: 'rgba(255, 255, 255, 0.10)',
    tooltipText: '#ffffff',
    crosshair: '#898781',
  },
}

/**
 * Fixed signal -> hue assignment (categorical slots 1-3, validated order).
 * Color follows the signal everywhere in the product, never its rank.
 */
export const SIGNAL_COLOR: Record<Signal, Record<Theme, string>> = {
  logs: { light: '#2a78d6', dark: '#3987e5' },
  traces: { light: '#008300', dark: '#008300' },
  metrics: { light: '#e87ba4', dark: '#d55181' },
}

export const SIGNAL_LABEL: Record<Signal, string> = {
  logs: 'Logs',
  traces: 'Traces',
  metrics: 'Metrics',
}

/**
 * Categorical palette for "color by entity" charts (metrics explorer:
 * one hue per customer; costs: one hue per customer stack). Deliberately
 * distinct hues from the signal palette so a customer series never reads
 * as a signal. Order is rank — slot follows selection order / volume rank.
 * Slots 5-8 extend the original 4 for the costs breakdown (max 8 + other).
 */
export const CATEGORICAL_COLOR: Record<Theme, readonly string[]> = {
  light: ['#6d4fc4', '#0f766e', '#c05717', '#245a8f', '#a13a6e', '#647d1f', '#8d6e63', '#5c6bc0'],
  dark: ['#9a7ee8', '#2aa198', '#e08a4a', '#5b9bd5', '#d4739f', '#9db35c', '#b3948a', '#8d9ae0'],
}

/** Lighter companion tones for dashed previous-period comparison series. */
export const CATEGORICAL_COLOR_MUTED: Record<Theme, readonly string[]> = {
  light: ['#b3a3e3', '#8fc4bf', '#e3b294', '#9dbedd', '#d9a3c0', '#b6c48d', '#c5b3ad', '#aeb6e2'],
  dark: ['#5d4c8a', '#1d6b64', '#8a5730', '#3b628a', '#844863', '#61703a', '#6f5c55', '#57608c'],
}

/** Neutral tone for aggregate "other" buckets in categorical charts. */
export const CATEGORICAL_OTHER_COLOR: Record<Theme, string> = {
  light: '#898781',
  dark: '#6e6d68',
}

export const SIGNALS: readonly Signal[] = ['logs', 'traces', 'metrics'] as const

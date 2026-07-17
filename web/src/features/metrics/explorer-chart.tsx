import { useMemo } from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import { useECharts } from '@/hooks/use-echarts'
import { useTheme } from '@/lib/theme'
import { CATEGORICAL_COLOR, CATEGORICAL_COLOR_MUTED, CHART_INK } from '@/lib/chart-theme'
import { formatRate } from '@/lib/format'
import { shiftToCurrentWindow, type Interval } from '@/lib/time-range'
import { Skeleton } from '@/components/ui/skeleton'
import type { ThroughputPoint } from '@/api/generated'

export interface ExplorerSeries {
  customerId: string
  name: string
  /** Categorical palette slot (selection order, 0-3). */
  colorIndex: number
  points: ThroughputPoint[]
  /** Previous-period points; present when compare mode is on. */
  previousPoints?: ThroughputPoint[]
}

/**
 * Multi-customer comparison line chart. One hue per customer (categorical
 * palette — never the signal hues); compare mode overlays the previous
 * period as a dashed, lighter line in the same hue, time-shifted onto the
 * current window so the lines share an axis. Crosshair tooltip sorts
 * values descending; the legend toggles series.
 */
export function ExplorerChart({
  series,
  interval,
  compare,
}: {
  series: ExplorerSeries[]
  interval: Interval
  compare: boolean
}) {
  const { theme } = useTheme()

  const option = useMemo<EChartsCoreOption>(() => {
    const ink = CHART_INK[theme]
    const palette = CATEGORICAL_COLOR[theme]
    const muted = CATEGORICAL_COLOR_MUTED[theme]

    const currentSeries = series.map((s) => {
      const color = palette[s.colorIndex % palette.length]
      return {
        name: s.name,
        type: 'line' as const,
        data: s.points.map((p) => [new Date(p.ts).getTime(), p.value]),
        showSymbol: false,
        lineStyle: { color, width: 2, join: 'round', cap: 'round' },
        itemStyle: { color },
        emphasis: { disabled: true },
      }
    })

    const previousSeries = compare
      ? series
          .filter((s) => s.previousPoints !== undefined)
          .map((s) => {
            const color = muted[s.colorIndex % muted.length]
            return {
              name: `${s.name} (prev)`,
              type: 'line' as const,
              data: (s.previousPoints ?? []).map((p) => [
                shiftToCurrentWindow(p.ts, interval),
                p.value,
              ]),
              showSymbol: false,
              lineStyle: { color, width: 1.5, type: 'dashed' as const },
              itemStyle: { color },
              emphasis: { disabled: true },
            }
          })
      : []

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 8, right: 12, top: 40, bottom: 4, containLabel: true },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 3,
        itemGap: 14,
        textStyle: { color: ink.label, fontSize: 11 },
        inactiveColor: ink.axisLine,
      },
      xAxis: {
        type: 'time',
        min: new Date(interval.from).getTime(),
        max: new Date(interval.to).getTime(),
        axisLine: { lineStyle: { color: ink.axisLine, width: 1 } },
        axisTick: { show: false },
        axisLabel: { color: ink.label, fontSize: 11, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: { color: ink.label, fontSize: 11, formatter: (v: number) => formatRate(v) },
        splitLine: { lineStyle: { color: ink.grid, width: 1, type: 'solid' } },
        splitNumber: 3,
      },
      tooltip: {
        trigger: 'axis',
        order: 'valueDesc',
        axisPointer: { type: 'line', lineStyle: { color: ink.crosshair, width: 1 } },
        backgroundColor: ink.tooltipBg,
        borderColor: ink.tooltipBorder,
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: ink.tooltipText, fontSize: 12 },
        valueFormatter: (v: unknown) => `${formatRate(Number(v))} items/s`,
      },
      series: [...currentSeries, ...previousSeries],
    }
  }, [theme, series, interval, compare])

  const ref = useECharts(option)

  return (
    <div
      ref={ref}
      className="h-80 w-full"
      role="img"
      aria-label="Per-customer throughput comparison chart"
    />
  )
}

export function ExplorerChartSkeleton() {
  return <Skeleton className="h-80 w-full" />
}

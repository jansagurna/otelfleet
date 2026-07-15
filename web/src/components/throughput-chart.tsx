import { useMemo } from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import { useECharts } from '@/hooks/use-echarts'
import { useTheme } from '@/lib/theme'
import { CHART_INK, SIGNAL_COLOR, SIGNAL_LABEL } from '@/lib/chart-theme'
import { formatRate } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import type { Signal, ThroughputPoint } from '@/api/generated'

/**
 * Single-signal throughput small multiple, per the dataviz method:
 * 2px line (round join/cap), ~10% area wash, hairline solid gridlines,
 * recessive axis ink, crosshair-snapped axis tooltip, no per-point labels,
 * no legend box (single series — the card title names it).
 */
export function ThroughputChart({ signal, points }: { signal: Signal; points: ThroughputPoint[] }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsCoreOption>(() => {
    const ink = CHART_INK[theme]
    const color = SIGNAL_COLOR[signal][theme]
    const data = points.map((p) => [new Date(p.ts).getTime(), p.value])
    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 8, right: 12, top: 12, bottom: 4, containLabel: true },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: ink.axisLine, width: 1 } },
        axisTick: { show: false },
        axisLabel: { color: ink.label, fontSize: 11, hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: {
          color: ink.label,
          fontSize: 11,
          formatter: (v: number) => formatRate(v),
        },
        splitLine: { lineStyle: { color: ink.grid, width: 1, type: 'solid' } },
        splitNumber: 3,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: ink.crosshair, width: 1 } },
        backgroundColor: ink.tooltipBg,
        borderColor: ink.tooltipBorder,
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: ink.tooltipText, fontSize: 12 },
        valueFormatter: (v: unknown) => `${formatRate(Number(v))} items/s`,
      },
      series: [
        {
          name: SIGNAL_LABEL[signal],
          type: 'line',
          data,
          showSymbol: false,
          lineStyle: { color, width: 2, join: 'round', cap: 'round' },
          itemStyle: { color },
          areaStyle: { color, opacity: 0.1 },
          emphasis: { disabled: true },
        },
      ],
    }
  }, [theme, signal, points])

  const ref = useECharts(option)

  return (
    <div
      ref={ref}
      className="h-44 w-full"
      role="img"
      aria-label={`${SIGNAL_LABEL[signal]} throughput chart`}
    />
  )
}

export function ThroughputChartCard({
  signal,
  points,
  currentRate,
}: {
  signal: Signal
  points: ThroughputPoint[]
  currentRate: number | null
}) {
  const { theme } = useTheme()
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-0.75 rounded-[1px]"
            style={{ background: SIGNAL_COLOR[signal][theme] }}
          />
          <span className="text-xs font-medium text-ink-2">{SIGNAL_LABEL[signal]}</span>
        </div>
        {currentRate !== null && (
          <span className="text-xs text-ink-3">
            <span className="font-semibold text-ink">{formatRate(currentRate)}</span> items/s now
          </span>
        )}
      </div>
      <ThroughputChart signal={signal} points={points} />
    </div>
  )
}

export function ThroughputChartSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-2 h-44 w-full" />
    </div>
  )
}

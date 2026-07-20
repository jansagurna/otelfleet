import { useMemo } from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import { useECharts } from '@/hooks/use-echarts'
import { useTheme } from '@/lib/theme'
import { CATEGORICAL_COLOR, CATEGORICAL_OTHER_COLOR, CHART_INK } from '@/lib/chart-theme'
import { formatBytes } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { bucketCustomers, unionDates, OTHER_BUCKET_ID } from './cost-math'
import type { CustomerCost } from '@/api/generated'

/**
 * Stacked bar chart: ingested bytes per day, one stack segment per customer
 * (top-N by volume + an aggregated "other" bucket). Categorical palette; the
 * "other" bucket takes the neutral ink. Tooltip lists per-customer bytes.
 */
export function CostChart({ customers }: { customers: CustomerCost[] }) {
  const { theme } = useTheme()

  const option = useMemo<EChartsCoreOption>(() => {
    const ink = CHART_INK[theme]
    const palette = CATEGORICAL_COLOR[theme]
    const { top, other } = bucketCustomers(customers)
    const shown = other ? [...top, other] : top
    const dates = unionDates(shown)

    const series = shown.map((c, i) => {
      const color =
        c.customerId === OTHER_BUCKET_ID
          ? CATEGORICAL_OTHER_COLOR[theme]
          : palette[i % palette.length]
      const byDate = new Map(c.days.map((d) => [d.date, d.bytes]))
      return {
        name: c.name,
        type: 'bar' as const,
        stack: 'bytes',
        data: dates.map((d) => byDate.get(d) ?? 0),
        itemStyle: { color },
        emphasis: { focus: 'series' as const },
      }
    })

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { left: 8, right: 12, top: 40, bottom: 4, containLabel: true },
      legend: {
        top: 0,
        left: 0,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        textStyle: { color: ink.label, fontSize: 11 },
        inactiveColor: ink.axisLine,
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: ink.axisLine, width: 1 } },
        axisTick: { show: false },
        axisLabel: { color: ink.label, fontSize: 11, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: { color: ink.label, fontSize: 11, formatter: (v: number) => formatBytes(v) },
        splitLine: { lineStyle: { color: ink.grid, width: 1, type: 'solid' } },
        splitNumber: 3,
      },
      tooltip: {
        trigger: 'axis',
        order: 'valueDesc',
        axisPointer: { type: 'shadow' },
        backgroundColor: ink.tooltipBg,
        borderColor: ink.tooltipBorder,
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: ink.tooltipText, fontSize: 12 },
        valueFormatter: (v: unknown) => formatBytes(Number(v)),
      },
      series,
    }
  }, [theme, customers])

  const ref = useECharts(option)

  return (
    <div ref={ref} className="h-80 w-full" role="img" aria-label="Ingest volume per customer per day" />
  )
}

export function CostChartSkeleton() {
  return <Skeleton className="h-80 w-full" />
}

import { useEffect, useRef, type RefObject } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption, ECharts } from 'echarts/core'

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

/**
 * Minimal ECharts binding: init once (canvas renderer), push options as
 * they change, resize with the container, dispose on unmount.
 */
export function useECharts(option: EChartsCoreOption | null): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const optionRef = useRef(option)
  optionRef.current = option

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = echarts.init(el, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    if (optionRef.current) chart.setOption(optionRef.current, { notMerge: true })
    const observer = new ResizeObserver(() => {
      if (!chart.isDisposed()) chart.resize()
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (option && chart && !chart.isDisposed()) chart.setOption(option, { notMerge: true })
  }, [option])

  return containerRef
}

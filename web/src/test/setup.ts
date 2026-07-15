import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { client } from '@/api/generated/client.gen'

// Node's Request needs an absolute URL; the app itself uses baseUrl '/'
// behind the Vite proxy.
client.setConfig({ baseUrl: 'http://localhost:3000' })

afterEach(() => {
  cleanup()
})

// jsdom does not implement scrollTo (used by the router on navigation).
Object.defineProperty(window, 'scrollTo', { writable: true, value: () => {} })

// jsdom does not implement ResizeObserver (used by the ECharts hook).
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom does not implement matchMedia (used for the initial theme).
if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

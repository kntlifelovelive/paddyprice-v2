/**
 * Client-side render helper for app-shell tests.
 *
 * Zustand v4 hooks read the store's SERVER snapshot during
 * `react-dom/server` renderToString, so store mutations (`setState`) are not
 * visible to SSR output. These tests mutate app/settings store state, so they
 * mount through `createRoot` + `act` instead (the live `useSyncExternalStore`
 * path). Helpers keep cleanup deterministic.
 */
import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

export interface Rendered {
  container: HTMLDivElement
  html(): string
  unmount(): Promise<void>
}

export async function rendermount(base: ReactNode): Promise<Rendered> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(base)
  })
  return {
    container,
    html: () => container.innerHTML,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { PaddyRoutes } from './router'
import { useAppStore } from './state'
import { createTestDatabase, closeTestDatabase } from '@/infrastructure/db/test-support'
import { useSettingsStore } from '@/shared/state'

const ROUTE_PAGES: Array<[string, string]> = [
  ['/', 'dashboard'],
  ['/purchase/new', 'purchase-new'],
  ['/purchase/42', 'purchase-edit'],
  ['/history', 'history'],
  ['/history/7', 'history-farmer'],
  ['/moisture', 'moisture'],
  ['/profit-loss', 'pnl'],
  ['/farmers', 'farmers'],
  ['/rice-types', 'rice-types'],
  ['/rice-prices', 'rice-prices'],
  ['/settings', 'settings'],
]

interface Rendered {
  html(): string
  unmount(): Promise<void>
}

async function renderAt(route: string): Promise<Rendered> {
  // Open a fresh test database — `getDatabase()` will return this singleton
  // for every page that reads it synchronously during render.
  await createTestDatabase()
  // Stub dbReady so the Layout/feature pages render their full body, not the
  // loading screen.
  useAppStore.setState({ bootstrapping: false, dbReady: true, dbError: null })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <PaddyRoutes />
      </MemoryRouter>,
    )
  })
  return {
    html: () => container.innerHTML,
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

describe('PaddyRoutes (full documented route table)', () => {
  beforeEach(() => {
    useSettingsStore.setState({ settings: null, loaded: false })
  })
  afterAll(() => {
    useAppStore.setState({ bootstrapping: false, dbReady: false, dbError: null })
    closeTestDatabase()
  })

  it.each(ROUTE_PAGES)('renders the %s placeholder', async (route, page) => {
    const r = await renderAt(route)
    try {
      expect(r.html()).toContain(`data-page="${page}"`)
    } finally {
      await r.unmount()
    }
  })

  it('redirects unknown paths to the Dashboard', async () => {
    const r = await renderAt('/totally-unknown')
    try {
      expect(r.html()).toContain('data-page="dashboard"')
    } finally {
      await r.unmount()
    }
  })
})
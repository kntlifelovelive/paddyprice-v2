import { beforeEach, describe, expect, it } from 'vitest'

import App from './App'
import { useAppStore } from './state'
import { rendermount } from './rendermount'

/**
 * Application shell gate tests — docs/ARCHITECTURE.md §3.7.
 *
 * App renders one of three bootstrap states driven by `app/state/useAppStore`:
 * loading (not bootstrapped yet), fail-safe error (bootstrap failed), or the
 * HashRouter'd application (dbReady). These states gate the whole app — while
 * none of the routers/layout/data render until ready (PROJECT_SPEC §1.2).
 *
 * Zustand v4: renderToString reads the store's INITIAL snapshot, so the tests
 * that mutate `dbReady`/`dbError` mount through `createRoot` + `act` (the live
 * `useSyncExternalStore` path) instead.
 */
describe('App (bootstrap gate states)', () => {
  beforeEach(() => {
    useAppStore.setState({
      bootstrapping: false,
      dbReady: false,
      dbError: null,
    })
  })

  it('shows a loading screen before bootstrap completes', async () => {
    useAppStore.setState({ bootstrapping: true, dbReady: false, dbError: null })
    const r = await rendermount(<App />)
    try {
      expect(r.html()).toContain('Starting Paddy')
      expect(r.html()).not.toContain('data-page=') // no routes/layout render yet
    } finally {
      await r.unmount()
    }
  })

  it('shows a fail-safe error screen when bootstrap fails', async () => {
    useAppStore.setState({ bootstrapping: false, dbReady: false, dbError: 'db exploded' })
    const r = await rendermount(<App />)
    try {
      expect(r.html()).toContain('Paddy could not start')
      expect(r.html()).toContain('db exploded')
      expect(r.html()).not.toContain('data-page=')
    } finally {
      await r.unmount()
    }
  })

  it('renders the routed application once the database is ready', async () => {
    useAppStore.setState({ bootstrapping: false, dbReady: true, dbError: null })
    const r = await rendermount(<App />)
    try {
      // HashRouter defaults to "/" → the Dashboard placeholder.
      expect(r.html()).toContain('data-page="dashboard"')
      // The layout's top bar is present (semantic token surfaces, no hard-coded
      // white/black business colors).
      expect(r.html()).toContain('bg-surface')
      expect(r.html()).not.toContain('text-white')
      expect(r.html()).not.toContain('text-black')
    } finally {
      await r.unmount()
    }
  })
})

import { beforeEach, describe, expect, it } from 'vitest'

import { useAppStore } from './useAppStore'

/**
 * App bootstrap-state contract (docs/ARCHITECTURE.md §3.7).
 * `initialize()` performs real DB/WASM work and is exercised by the app entry
 * point and the infrastructure db tests; here we pin the state-machine
 * contract App's gate rendering depends on.
 */
describe('useAppStore (bootstrap state contract)', () => {
  beforeEach(() => {
    useAppStore.setState({ bootstrapping: false, dbReady: false, dbError: null })
  })

  it('starts unready, not bootstrapping, with no error', () => {
    const s = useAppStore.getState()
    expect(s.dbReady).toBe(false)
    expect(s.bootstrapping).toBe(false)
    expect(s.dbError).toBeNull()
  })

  it('can transition to the ready gate state', () => {
    useAppStore.setState({ bootstrapping: false, dbReady: true, dbError: null })
    const s = useAppStore.getState()
    expect(s.dbReady).toBe(true)
    expect(s.dbError).toBeNull()
  })

  it('can transition to the fail-safe error gate state', () => {
    useAppStore.setState({ bootstrapping: false, dbReady: false, dbError: 'bootstrap failed' })
    const s = useAppStore.getState()
    expect(s.dbReady).toBe(false)
    expect(s.dbError).toBe('bootstrap failed')
  })
})
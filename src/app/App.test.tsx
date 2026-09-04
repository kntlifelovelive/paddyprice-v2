import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { useAppStore } from './state'
import { rendermount } from './rendermount'

// Controllable fake of the shared device-auth store (the real singleton talks
// to the native Capacitor bridge / app database, unavailable in jsdom).
const deviceActions = vi.hoisted(() => ({
  initialize: vi.fn(),
  beginActivation: vi.fn(),
  cancelActivation: vi.fn(),
  deactivateLocal: vi.fn(),
}))
const deviceFake = {
  state: 'authorized' as string,
  activating: false,
  fingerprint: null as string | null,
  error: null as string | null,
}

vi.mock('@/services/device-auth/store', () => {
  const snapshot = () => ({ ...deviceFake, ...deviceActions })
  // The hook is selector-based (component reads) with a getState static
  // (App's bootstrap effect calls useDeviceAuthStore.getState().initialize()).
  const hook = (selector: (s: ReturnType<typeof snapshot>) => unknown) => selector(snapshot())
  ;(hook as unknown as { getState: typeof snapshot }).getState = snapshot
  return { useDeviceAuthStore: hook }
})

/**
 * Application shell gate tests — docs/ARCHITECTURE.md §3.7.
 *
 * Gate order (PROJECT_SPEC §1.2): bootstrap → Device Authorization → App Lock
 * → application. App renders one of: loading, bootstrap error, device-checking
 * spinner, DeviceGate (unauthorized — installer required), LockScreen, or the
 * HashRouter'd application. While any gate is active, no routes/layout/data
 * render.
 *
 * Zustand v4: renderToString reads the store's INITIAL snapshot, so the tests
 * that mutate gate states mount through `createRoot` + `act` (the live
 * `useSyncExternalStore` path) instead.
 */
describe('App (bootstrap gate states)', () => {
  beforeEach(() => {
    useAppStore.setState({
      bootstrapping: false,
      dbReady: false,
      dbError: null,
    })
    deviceFake.state = 'authorized'
    deviceFake.activating = false
    deviceFake.fingerprint = null
    deviceFake.error = null
    deviceActions.cancelActivation.mockClear()
    deviceActions.beginActivation.mockClear()
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

describe('App (device authorization gate — PROJECT_SPEC §1.2)', () => {
  beforeEach(() => {
    useAppStore.setState({
      bootstrapping: false,
      dbReady: true,
      dbError: null,
    })
    deviceFake.state = 'authorized'
    deviceFake.activating = false
    deviceFake.fingerprint = null
    deviceFake.error = null
    deviceActions.cancelActivation.mockClear()
    deviceActions.beginActivation.mockClear()
  })

  it('renders no app content while the device authorization check runs', async () => {
    deviceFake.state = 'checking'
    const r = await rendermount(<App />)
    try {
      expect(r.html()).toContain('Checking device authorization')
      expect(r.html()).not.toContain('data-page="dashboard"')
    } finally {
      await r.unmount()
    }
  })

  it('gates an unauthorized device behind the installer-required notice (plain adb install)', async () => {
    deviceFake.state = 'unauthorized'
    const r = await rendermount(<App />)
    try {
      expect(r.html()).toContain('Device not activated')
      expect(r.html()).toContain('./install.sh')
      // The application itself is NOT usable: no routes, layout, or data.
      expect(r.html()).not.toContain('data-page="dashboard"')
    } finally {
      await r.unmount()
    }
  })

  it('the device gate precedes App Lock (unauthorized wins over locked)', async () => {
    deviceFake.state = 'unauthorized'
    useAppStore.setState({ bootstrapping: false, dbReady: true, dbError: null })
    const r = await rendermount(<App />)
    try {
      // DeviceGate — NOT the lock screen and NOT the app.
      expect(r.html()).toContain('Device not activated')
      expect(r.html()).not.toContain('Draw your pattern')
      expect(r.html()).not.toContain('data-page="dashboard"')
    } finally {
      await r.unmount()
    }
  })

  it('an authorized device proceeds past the gate (normal startup)', async () => {
    deviceFake.state = 'authorized'
    const r = await rendermount(<App />)
    try {
      expect(r.html()).toContain('data-page="dashboard"')
      expect(r.html()).not.toContain('Device not activated')
    } finally {
      await r.unmount()
    }
  })

  it('web (unsupported platform) is not gated', async () => {
    deviceFake.state = 'unsupported'
    const r = await rendermount(<App />)
    try {
      expect(r.html()).toContain('data-page="dashboard"')
      expect(r.html()).not.toContain('Device not activated')
    } finally {
      await r.unmount()
    }
  })

  it('renders DeviceGate while activation is in progress (no app content)', async () => {
    deviceFake.state = 'unauthorized'
    deviceFake.activating = true
    const r = await rendermount(<App />)
    try {
      expect(r.html()).toContain('Device not activated')
      expect(r.html()).toContain('Cancel activation')
      expect(r.html()).not.toContain('data-page="dashboard"')
    } finally {
      await r.unmount()
    }
  })

  it('cancel activation never bypasses the device authorization gate', async () => {
    deviceFake.state = 'unauthorized'
    deviceFake.activating = true
    const r = await rendermount(<App />)
    try {
      const buttons = Array.from(r.container.querySelectorAll('button'))
      const cancel = buttons.find((b) => b.textContent?.includes('Cancel activation'))
      expect(cancel).toBeDefined()
      cancel!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await vi.waitFor(() => {
        expect(deviceActions.cancelActivation).toHaveBeenCalledTimes(1)
      })
      // The fake store keeps the REAL semantics of cancelActivation: state
      // stays unauthorized (cancel is not authorization) → the gate remains
      // the entire screen and the application stays inaccessible.
      expect(r.html()).toContain('Device not activated')
      expect(r.html()).not.toContain('data-page="dashboard"')
    } finally {
      await r.unmount()
    }
  })

  it('unauthorized device remains blocked after cancel and application restart', async () => {
    // Simulates the physical failure sequence at the App RENDERING boundary:
    // boot 1 (unauthorized) → gate → cancel → restart → boot 2 still
    // unauthorized → gate. The router must never be mounted while the device
    // is not positively authorized.
    function bootAndCancel() {
      deviceFake.state = 'unauthorized'
      deviceFake.activating = true
      return rendermount(<App />)
    }
    const boot1 = await bootAndCancel()
    try {
      expect(boot1.html()).toContain('Device not activated')
      const buttons = Array.from(boot1.container.querySelectorAll('button'))
      const cancel = buttons.find((b) => b.textContent?.includes('Cancel activation'))
      cancel!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await vi.waitFor(() => {
        expect(deviceActions.cancelActivation).toHaveBeenCalledTimes(1)
      })
      expect(boot1.html()).toContain('Device not activated')
      expect(boot1.html()).not.toContain('data-page="dashboard"')
    } finally {
      await boot1.unmount()
    }

    // Boot 2 (fresh mount = process/Activity restart): the store re-init
    // runs the REAL check; the fake represents it resolving unauthorized.
    deviceActions.cancelActivation.mockClear()
    deviceFake.state = 'unauthorized'
    deviceFake.activating = false
    const boot2 = await rendermount(<App />)
    try {
      expect(boot2.html()).toContain('Device not activated')
      // The router/layout/dashboard are structurally NOT mounted — the gate
      // is the entire screen (this is not a CSS overlay or redirect).
      expect(boot2.html()).not.toContain('data-page="dashboard"')
      expect(boot2.html()).not.toContain('data-page="settings"')
      expect(boot2.container.querySelectorAll('a[href]')).toHaveLength(0)
    } finally {
      await boot2.unmount()
    }
  })
})

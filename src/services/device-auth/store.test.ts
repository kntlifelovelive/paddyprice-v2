// @vitest-environment node
/**
 * Device-auth store tests — the shared authorization state that gates app
 * startup AND Settings → Device Activation (real state only, no fake
 * authorization path).
 */
import { describe, expect, it, vi } from 'vitest'
import type { DeviceAuthAdapter, DeviceStatus, ListenerHandle } from '@/types'
import { createDeviceAuthStore } from './store'
import { DEVICE_KEY_CERT, DEVICE_KEY_FP } from './service'

interface Harness {
  adapter: DeviceAuthAdapter & {
    status: DeviceStatus
    listeners: Record<string, () => void>
  }
  store: Map<string, string>
  storeApi: ReturnType<typeof createDeviceAuthStore>
}

function createHarness(initialStatus: DeviceStatus): Harness {
  const listeners: Record<string, () => void> = {}
  const adapter = {
    status: initialStatus,
    listeners,
    getStatus: vi.fn(() => Promise.resolve(adapter.status)),
    ensureKeyPair: vi.fn(() => Promise.resolve({ fp: 'fp-device', spkiB64: 'c3BraQ==' })),
    startActivationServer: vi.fn(() => Promise.resolve()),
    stopActivationServer: vi.fn(() => Promise.resolve()),
    deactivate: vi.fn(() => Promise.resolve()),
    addListener: vi.fn((_event: string, cb: () => void): Promise<ListenerHandle> => {
      adapter.listeners[_event] = cb
      return Promise.resolve({ remove: () => Promise.resolve() })
    }),
  }
  const store = new Map<string, string>()
  const storeApi = createDeviceAuthStore({
    adapter: adapter as DeviceAuthAdapter,
    persistence: () => ({
      getSetting: (key) => store.get(key) ?? null,
      setSetting: (key, value) => void store.set(key, value),
    }),
  })
  return { adapter: adapter as Harness['adapter'], store, storeApi }
}

describe('device-auth store — startup gate states', () => {
  it('starts in checking — no app content may render before the check', () => {
    const h = createHarness({ supported: true, hasKey: false, savedFp: null })
    expect(h.storeApi.getState().state).toBe('checking')
  })

  it('reports unsupported on web — gate skipped, nothing persisted', async () => {
    const h = createHarness({ supported: false, hasKey: false, savedFp: null })
    await h.storeApi.getState().initialize()
    expect(h.storeApi.getState().state).toBe('unsupported')
    expect(h.store.size).toBe(0)
  })

  it('reports unauthorized when never activated (plain adb install)', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    await h.storeApi.getState().initialize()
    expect(h.storeApi.getState().state).toBe('unauthorized')
  })

  it('reports unauthorized when app data was cleared but the Keystore key remains', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    // cert missing → unauthorized
    await h.storeApi.getState().initialize()
    expect(h.storeApi.getState().state).toBe('unauthorized')
  })

  it('reports authorized when stored settings match the native state (persists across restart)', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, JSON.stringify({ fp: 'fp-device', at: 1 }))
    await h.storeApi.getState().initialize()
    expect(h.storeApi.getState().state).toBe('authorized')
    expect(h.storeApi.getState().fingerprint).toBe('fp-device')
  })

  it('treats a DB/native fingerprint mismatch as unauthorized (fail-safe)', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-other' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, JSON.stringify({ fp: 'fp-device', at: 1 }))
    await h.storeApi.getState().initialize()
    expect(h.storeApi.getState().state).toBe('unauthorized')
  })

  it('fails safe on adapter errors: unauthorized with an error message', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.adapter.getStatus = vi.fn(() => Promise.reject(new Error('plugin failure')))
    await h.storeApi.getState().initialize()
    // The service's check() catches the adapter failure and fails safe to
    // unauthorized with its stable English message — the store reflects it.
    expect(h.storeApi.getState().state).toBe('unauthorized')
    expect(h.storeApi.getState().error).toBe('Device authorization check failed')
  })
})

describe('device-auth store — activation (real protocol transitions only)', () => {
  it('beginActivation starts the server and marks the wait state', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: null })
    await h.storeApi.getState().beginActivation()
    expect(h.adapter.startActivationServer).toHaveBeenCalledTimes(1)
    expect(h.storeApi.getState().activating).toBe(true)
    // Not authorized yet — the installer handshake has not completed.
    expect(h.storeApi.getState().state).toBe('checking')
  })

  it('deviceActivated event transitions to authorized and persists the certificate', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: null })
    await h.storeApi.getState().beginActivation()
    // The native plugin persists the fingerprint BEFORE emitting the event.
    h.adapter.status = { supported: true, hasKey: true, savedFp: 'fp-device' }
    h.adapter.listeners['deviceActivated']()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h.storeApi.getState().state).toBe('authorized')
    expect(h.storeApi.getState().fingerprint).toBe('fp-device')
    expect(h.storeApi.getState().activating).toBe(false)
    expect(h.store.get(DEVICE_KEY_FP)).toBe('fp-device')
    expect(JSON.parse(h.store.get(DEVICE_KEY_CERT) ?? '{}')).toMatchObject({ fp: 'fp-device' })
  })

  it('activation server failure sets an error and never a fake authorized state', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: null })
    h.adapter.startActivationServer = vi.fn(() =>
      Promise.reject(new Error('Cannot bind activation server')),
    )
    await h.storeApi.getState().beginActivation()
    expect(h.storeApi.getState().state).not.toBe('authorized')
    expect(h.storeApi.getState().activating).toBe(false)
    expect(h.storeApi.getState().error).toBe('Cannot bind activation server')
  })

  it('deviceDeactivated event re-gates the app (installer transfer/revoke)', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, '{"fp":"fp-device","at":1}')
    await h.storeApi.getState().beginActivation()
    h.adapter.listeners['deviceDeactivated']()
    await Promise.resolve()
    expect(h.storeApi.getState().state).toBe('unauthorized')
    expect(h.store.get(DEVICE_KEY_FP)).toBe('')
    expect(h.store.get(DEVICE_KEY_CERT)).toBe('')
  })

  it('deactivateLocal clears plugin state + settings and re-gates', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, '{"fp":"fp-device","at":1}')
    await h.storeApi.getState().deactivateLocal()
    expect(h.adapter.deactivate).toHaveBeenCalledTimes(1)
    expect(h.storeApi.getState().state).toBe('unauthorized')
    expect(h.store.get(DEVICE_KEY_FP)).toBe('')
    expect(h.store.get(DEVICE_KEY_CERT)).toBe('')
  })

  it('deactivate only transitions to unauthorized AFTER native success (no JS-only revoke)', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, '{"fp":"fp-device","at":1}')
    // Native deactivation rejects — the device was NOT actually revoked.
    h.adapter.deactivate = vi.fn(() => Promise.reject(new Error('keystore busy')))
    await h.storeApi.getState().deactivateLocal()
    // The store must NOT claim unauthorized while the native layer still
    // reports authorized: a JS-only revoke would make a restart reopen the
    // app. The real native state is re-read and reflected.
    expect(h.storeApi.getState().state).toBe('authorized')
    expect(h.storeApi.getState().error).toBe('keystore busy')
    // Persisted settings are NOT cleared on a failed native deactivation.
    expect(h.store.get(DEVICE_KEY_FP)).toBe('fp-device')
  })

  it('deactivation native failure with a failing re-check fails closed to unauthorized', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, '{"fp":"fp-device","at":1}')
    h.adapter.deactivate = vi.fn(() => Promise.reject(new Error('keystore busy')))
    h.adapter.getStatus = vi.fn(() => Promise.reject(new Error('bridge unreachable')))
    await h.storeApi.getState().deactivateLocal()
    expect(h.storeApi.getState().state).toBe('unauthorized') // fail closed
    expect(h.storeApi.getState().error).toBe('keystore busy')
  })

  it('restart after a successful deactivate stays unauthorized (native + persisted)', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    const persisted = h.store
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, '{"fp":"fp-device","at":1}')
    // The native deactivate clears the keystore key AND the native prefs.
    await h.storeApi.getState().deactivateLocal()
    expect(h.storeApi.getState().state).toBe('unauthorized')
    h.adapter.status = { supported: true, hasKey: false, savedFp: null }

    // Boot 2 (restart): a fresh store over the SAME persisted settings.
    const rebooted = createDeviceAuthStore({
      adapter: h.adapter as DeviceAuthAdapter,
      persistence: () => ({
        getSetting: (key) => persisted.get(key) ?? null,
        setSetting: (key, value) => void persisted.set(key, value),
      }),
    })
    expect(rebooted.getState().state).toBe('checking')
    await rebooted.getState().initialize()
    expect(rebooted.getState().state).toBe('unauthorized')
    expect(persisted.get(DEVICE_KEY_FP)).toBe('')
    expect(persisted.get(DEVICE_KEY_CERT)).toBe('')
  })

  it('cancelActivation stops the wait without granting authorization', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: null })
    await h.storeApi.getState().beginActivation()
    await h.storeApi.getState().cancelActivation()
    expect(h.adapter.stopActivationServer).toHaveBeenCalledTimes(1)
    expect(h.storeApi.getState().activating).toBe(false)
    expect(h.storeApi.getState().state).not.toBe('authorized')
  })

  it('cancel activation never bypasses the device authorization gate', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    await h.storeApi.getState().initialize() // unauthorized
    await h.storeApi.getState().beginActivation()
    expect(h.storeApi.getState().activating).toBe(true)
    const fpBefore = h.store.get(DEVICE_KEY_FP)
    const certBefore = h.store.get(DEVICE_KEY_CERT)
    await h.storeApi.getState().cancelActivation()
    // Still unauthorized — cancel is NOT authorize.
    expect(h.storeApi.getState().state).toBe('unauthorized')
    expect(h.storeApi.getState().activating).toBe(false)
    // Cancel writes NOTHING to the persisted authorization material.
    expect(h.store.get(DEVICE_KEY_FP)).toBe(fpBefore)
    expect(h.store.get(DEVICE_KEY_CERT)).toBe(certBefore)
    // A fresh startup check still reports unauthorized → gate stays up.
    await h.storeApi.getState().initialize()
    expect(h.storeApi.getState().state).toBe('unauthorized')
  })

  it('repeated cancel calls can never produce an authorized state', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    await h.storeApi.getState().beginActivation()
    for (let i = 0; i < 3; i++) {
      await h.storeApi.getState().cancelActivation()
    }
    // SECURITY INVARIANT: cancel always fails closed to unauthorized so the
    // security notice re-appears. Never 'authorized' under any condition.
    expect(h.storeApi.getState().state).toBe('unauthorized')
    expect(h.storeApi.getState().state).not.toBe('authorized')
    expect(h.storeApi.getState().activating).toBe(false)
    expect(h.store.size).toBe(0) // nothing persisted
  })

  it('cancel (activation attempt) and deactivate (authorization) stay separate operations', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    await h.storeApi.getState().initialize() // unauthorized
    await h.storeApi.getState().beginActivation()
    await h.storeApi.getState().cancelActivation()
    // Cancel must NOT clear plugin key state or settings — that is deactivation.
    expect(h.adapter.deactivate).not.toHaveBeenCalled()
    expect(h.storeApi.getState().state).toBe('unauthorized')
    // Deactivation remains the only path that clears state + settings.
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, '{"fp":"fp-device","at":1}')
    await h.storeApi.getState().deactivateLocal()
    expect(h.adapter.deactivate).toHaveBeenCalledTimes(1)
    expect(h.store.get(DEVICE_KEY_FP)).toBe('')
  })

  it('unsupported (web) activation is a no-op — no authorized state can be fabricated', async () => {
    const h = createHarness({ supported: false, hasKey: false, savedFp: null })
    await h.storeApi.getState().beginActivation()
    expect(h.storeApi.getState().state).toBe('unsupported')
    expect(h.storeApi.getState().activating).toBe(false)
  })

  it('unauthorized device remains blocked after cancel and application restart', async () => {
    // Reproduces the physical failure sequence: fresh launch → gate state
    // (unauthorized) → activation attempt → Cancel → force-stop → relaunch.
    // A restart creates a FRESH store (in-memory state gone) while the
    // PERSISTED settings survive — modeled by reusing the same map.
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    const persisted = h.store
    void persisted

    // Boot 1: check → unauthorized → gate; activation attempt → cancel.
    await h.storeApi.getState().initialize()
    expect(h.storeApi.getState().state).toBe('unauthorized')
    await h.storeApi.getState().beginActivation()
    await h.storeApi.getState().cancelActivation()
    expect(h.storeApi.getState().state).toBe('unauthorized')

    // Boot 2 (restart): a brand-new store over the SAME persisted settings —
    // the in-memory state is gone and the real check must run again.
    const rebooted = createDeviceAuthStore({
      adapter: h.adapter as DeviceAuthAdapter,
      persistence: () => ({
        getSetting: (key) => persisted.get(key) ?? null,
        setSetting: (key, value) => void persisted.set(key, value),
      }),
    })
    // Fail-closed default: a restarted app can never assume authorized.
    expect(rebooted.getState().state).toBe('checking')
    await rebooted.getState().initialize()
    expect(rebooted.getState().state).toBe('unauthorized')
    // Nothing from the cancelled session leaked into persistence.
    expect(persisted.get(DEVICE_KEY_FP)).toBeUndefined()
    expect(persisted.get(DEVICE_KEY_CERT)).toBeUndefined()
  })
})

describe('device-auth store — security', () => {
  it('state and persistence contain only fingerprints, never key material', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, '{"fp":"fp-device","at":1}')
    await h.storeApi.getState().initialize()
    const snapshot = JSON.stringify(h.storeApi.getState())
    expect(snapshot).not.toMatch(/keypass|private|pem|password/i)
    // The persisted certificate is only a fingerprint + timestamp wrapper.
    expect(h.store.get(DEVICE_KEY_CERT)).not.toMatch(/private|keypass/i)
  })
})


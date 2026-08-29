// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { DeviceAuthAdapter, DeviceStatus, ListenerHandle } from '@/types'
import { createDeviceAuthService, DEVICE_KEY_CERT, DEVICE_KEY_FP } from './service'
import { DEVICE_AUTH_CHECK_FAILED } from '@/services/security/messages'

interface Harness {
  adapter: DeviceAuthAdapter & {
    status: DeviceStatus
    listeners: Record<string, () => void>
  }
  store: Map<string, string>
  service: ReturnType<typeof createDeviceAuthService>
  onActivated: ReturnType<typeof vi.fn>
  onDeactivated: ReturnType<typeof vi.fn>
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
  const onActivated = vi.fn()
  const onDeactivated = vi.fn()
  const service = createDeviceAuthService({
    adapter,
    getSetting: (key) => store.get(key) ?? null,
    setSetting: (key, value) => void store.set(key, value),
    onActivated,
    onDeactivated,
  })
  return { adapter: adapter as Harness['adapter'], store, service, onActivated, onDeactivated }
}

describe('device authorization service (mock adapter)', () => {
  it('reports unsupported on desktop/web — gate skipped, nothing persisted', async () => {
    const h = createHarness({ supported: false, hasKey: false, savedFp: null })
    const result = await h.service.check()
    expect(result).toEqual({ state: 'unsupported', fingerprint: null, error: null })
    expect(h.store.size).toBe(0)
  })

  it('reports unauthorized when never activated (no stored settings)', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    expect(await h.service.check()).toEqual({
      state: 'unauthorized',
      fingerprint: 'fp-device',
      error: null,
    })
  })

  it('reports unauthorized when app data was cleared but the Keystore key remains', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    // cert missing → unauthorized
    expect((await h.service.check()).state).toBe('unauthorized')
  })

  it('reports authorized when stored settings match the native state', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, JSON.stringify({ fp: 'fp-device', at: 1 }))
    expect(await h.service.check()).toEqual({
      state: 'authorized',
      fingerprint: 'fp-device',
      error: null,
    })
  })

  it('treats a DB/native fingerprint mismatch as unauthorized (fail-safe)', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-other' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, JSON.stringify({ fp: 'fp-device', at: 1 }))
    const result = await h.service.check()
    expect(result.state).toBe('unauthorized')
    expect(result.fingerprint).toBe('fp-other')
  })

  it('fails safe on adapter errors: unauthorized with an error message', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.adapter.getStatus = vi.fn(() => Promise.reject(new Error('plugin failure')))
    const result = await h.service.check()
    expect(result.state).toBe('unauthorized')
    expect(result.error).toBe(DEVICE_AUTH_CHECK_FAILED)
    expect(result.error).toBe('Device authorization check failed')
  })

  it('beginActivation persists device.fp + device.cert when activation completes', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: null })
    await h.service.beginActivation()
    expect(h.adapter.startActivationServer).toHaveBeenCalledTimes(1)
    // The native plugin persists the fingerprint BEFORE emitting the event
    // (reference store behavior: the handler reads `savedFp` from getStatus()
    // and persists it), so simulate that post-activation native state here.
    h.adapter.status = { supported: true, hasKey: true, savedFp: 'fp-device' }
    // Simulate the native plugin emitting the activation event.
    h.adapter.listeners['deviceActivated']()
    // Macrotask flush: deterministically drains every pending microtask
    // (activation handler, adapter getStatus) before asserting persistence.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(h.store.get(DEVICE_KEY_FP)).toBe('fp-device')
    const cert = JSON.parse(h.store.get(DEVICE_KEY_CERT) ?? '{}') as { fp: string; at: number }
    expect(cert.fp).toBe('fp-device')
    expect(typeof cert.at).toBe('number')
    expect(h.onActivated).toHaveBeenCalledWith('fp-device')
  })

  it('deactivate clears the plugin state and both persisted settings', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    h.store.set(DEVICE_KEY_CERT, '{"fp":"fp-device","at":1}')
    await h.service.deactivate()
    expect(h.adapter.deactivate).toHaveBeenCalledTimes(1)
    expect(h.store.get(DEVICE_KEY_FP)).toBe('')
    expect(h.store.get(DEVICE_KEY_CERT)).toBe('')
    expect(h.onDeactivated).toHaveBeenCalledTimes(1)
  })

  it('deviceDeactivated event clears persisted settings without throwing', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: 'fp-device' })
    h.store.set(DEVICE_KEY_FP, 'fp-device')
    await h.service.beginActivation()
    h.adapter.listeners['deviceDeactivated']()
    await Promise.resolve()
    expect(h.store.get(DEVICE_KEY_FP)).toBe('')
    expect(h.store.get(DEVICE_KEY_CERT)).toBe('')
    expect(h.onDeactivated).toHaveBeenCalledTimes(1)
  })

  it('stopActivationServer delegates to the adapter', async () => {
    const h = createHarness({ supported: true, hasKey: true, savedFp: null })
    await h.service.stopActivationServer()
    expect(h.adapter.stopActivationServer).toHaveBeenCalledTimes(1)
  })
})

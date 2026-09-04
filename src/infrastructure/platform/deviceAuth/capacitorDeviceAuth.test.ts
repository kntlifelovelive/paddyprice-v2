/**
 * Capacitor device-auth adapter tests (§7).
 *
 * Verifies the platform-guarded adapter contract:
 *  - WEB: reports `supported:false` (the sanctioned no-gate exception), never
 *    consults the native plugin.
 *  - NATIVE (android/ios): every call delegates to the real plugin bridge and
 *    FAILS CLOSED — a broken/missing plugin (reject or `supported:false`)
 *    surfaces as a throw, never as a fabricated authorized state and never as
 *    the web fallback's "unsupported".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Control the platform string returned by @capacitor/core's getPlatform().
const platformMock = vi.hoisted(() => ({ platform: 'web' }))
const nativeMock = vi.hoisted(() => ({
  getStatus: vi.fn(),
  ensureKeyPair: vi.fn(),
  startActivationServer: vi.fn(),
  stopActivationServer: vi.fn(),
  deactivate: vi.fn(),
  addListener: vi.fn(),
}))

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>()
  return {
    ...actual,
    // The adapter reads Capacitor.getPlatform(); patch the Capacitor object.
    Capacitor: {
      ...actual.Capacitor,
      getPlatform: () => platformMock.platform,
    },
    registerPlugin: (_name: string, opts: { web: unknown }) => {
      const web = opts.web as Record<string, unknown>
      const native = new Proxy({} as typeof nativeMock, {
        get(_target, prop) {
          if (prop === 'then') return undefined
          if (prop in nativeMock) return nativeMock[prop as keyof typeof nativeMock]
          return undefined
        },
      })
      return new Proxy({} as { native: typeof native; web: typeof web }, {
        get(_target, prop) {
          if (prop === 'then') return undefined
          if (prop === 'web') return web
          return native[prop as keyof typeof native] ?? web[prop as keyof typeof web]
        },
      })
    },
  }
})

const { capacitorDeviceAuth, isNativePlatform } = await import('@/infrastructure/platform/deviceAuth/capacitorDeviceAuth')

describe('isNativePlatform', () => {
  it('is true on android/ios and false on web', () => {
    platformMock.platform = 'android'
    expect(isNativePlatform()).toBe(true)
    platformMock.platform = 'ios'
    expect(isNativePlatform()).toBe(true)
    platformMock.platform = 'web'
    expect(isNativePlatform()).toBe(false)
  })
})
describe('capacitorDeviceAuth adapter — web (sanctioned exception)', () => {
  beforeEach(() => {
    platformMock.platform = 'web'
  })

  it('reports supported:false on a genuinely non-native target', async () => {
    const status = await capacitorDeviceAuth.getStatus()
    expect(status).toEqual({ supported: false, hasKey: false, savedFp: null })
    // The native bridge must NOT be consulted on web.
    expect(nativeMock.getStatus).not.toHaveBeenCalled()
  })

  it('web never produces an authorized state', async () => {
    const status = await capacitorDeviceAuth.getStatus()
    expect(status.supported).toBe(false)
    expect(status.savedFp).toBeNull()
  })
})

describe('capacitorDeviceAuth adapter — native (delegation + fail closed)', () => {
  beforeEach(() => {
    platformMock.platform = 'android'
    nativeMock.getStatus.mockReset()
    nativeMock.ensureKeyPair.mockReset()
    nativeMock.startActivationServer.mockReset()
    nativeMock.stopActivationServer.mockReset()
    nativeMock.deactivate.mockReset()
    nativeMock.addListener.mockReset()
  })

  it('getStatus delegates to the native plugin and returns its result', async () => {
    nativeMock.getStatus.mockResolvedValue({ supported: true, hasKey: true, savedFp: 'abc123' })
    const status = await capacitorDeviceAuth.getStatus()
    expect(status).toEqual({ supported: true, hasKey: true, savedFp: 'abc123' })
    expect(nativeMock.getStatus).toHaveBeenCalledTimes(1)
  })

  it('a native "supported:false" (broken plugin) throws — never treated as web unsupported', async () => {
    // On a native platform a misbehaving plugin reporting supported:false
    // must THROW (fail closed) instead of surfacing the sanctioned web
    // "unsupported" (which would unlock the app on web).
    nativeMock.getStatus.mockResolvedValue({ supported: false, hasKey: false, savedFp: null })
    await expect(capacitorDeviceAuth.getStatus()).rejects.toBeTruthy()
  })

  it('never consults the web fallback on a native platform', async () => {
    // Even if the native call rejects, the web adapter (supported:false) is
    // never returned. The reject is the fail-closed result.
    nativeMock.getStatus.mockRejectedValue(new Error('bridge unreachable'))
    await expect(capacitorDeviceAuth.getStatus()).rejects.toThrow('bridge unreachable')
  })

  it('only a real native supported:true passes through', async () => {
    // The web fallback is unreachable on native by construction; the ONLY
    // authorized path requires a real native reply of supported:true.
    nativeMock.getStatus.mockResolvedValue({ supported: true, hasKey: true, savedFp: 'fp-abc' })
    const status = await capacitorDeviceAuth.getStatus()
    expect(status).toEqual({ supported: true, hasKey: true, savedFp: 'fp-abc' })
  })
})

describe('capacitorDeviceAuth adapter — security', () => {
  it('never references keypass, master key, or private key material', () => {
    const secretProps = Object.keys(capacitorDeviceAuth).filter((k) =>
      /keypass|master|private|pem|password/i.test(k),
    )
    expect(secretProps).toEqual([])
  })
})

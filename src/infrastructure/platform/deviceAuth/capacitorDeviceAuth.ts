/**
 * Capacitor adapter for the native DeviceAuth plugin (Android Keystore +
 * loopback activation server, §6.4).
 *
 * Platform boundary: `infrastructure/platform/deviceAuth/`.
 *
 * SECURITY (fail closed): on a NATIVE platform (Android) the ONLY acceptable
 * answer comes from the native plugin bridge. The web fallback implementation
 * is NEVER consulted on native. The platform decision uses the canonical
 * Capacitor `getPlatform()`; in the Android WebView container that is
 * `'android'` (never `'web'`), so the native bridge is used. If the native
 * plugin is missing or the bridge call fails, the call THROWS and the
 * device-auth service treats any adapter failure as `unauthorized` — a broken
 * plugin can block the app but can never silently unlock it.
 * `supported: false` (no gate) is reserved exclusively for genuinely
 * non-native targets (web/desktop).
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { DeviceAuthAdapter, DeviceKeyPair, DeviceStatus, ListenerHandle } from '@/types'

export interface DeviceAuthPluginInterface {
  getStatus(): Promise<DeviceStatus>
  ensureKeyPair(): Promise<DeviceKeyPair>
  startActivationServer(options?: { port?: number }): Promise<void>
  stopActivationServer(): Promise<void>
  deactivate(): Promise<void>
  addListener(
    eventName: 'deviceActivated' | 'deviceDeactivated',
    listenerFunc: () => void,
  ): Promise<ListenerHandle>
}

class WebDeviceAuthAdapter implements DeviceAuthPluginInterface {
  async getStatus(): Promise<DeviceStatus> {
    return { supported: false, hasKey: false, savedFp: null }
  }
  async ensureKeyPair(): Promise<DeviceKeyPair> {
    throw new Error('Device authorization is not available on this platform')
  }
  async startActivationServer(): Promise<void> {}
  async stopActivationServer(): Promise<void> {}
  async deactivate(): Promise<void> {}
  async addListener(): Promise<ListenerHandle> {
    return { remove: async () => {} }
  }
}

const webAdapter: DeviceAuthPluginInterface = new WebDeviceAuthAdapter()

/**
 * The typed native bridge. Registered once; on a native target its methods
 * bridge to the Android plugin. Exposed as a distinct reference so call sites
 * never accidentally hit the web implementation on native.
 */
const registered = registerPlugin<DeviceAuthPluginInterface>('DeviceAuth', {
  web: webAdapter,
})

/** Typed bridge view over the Capacitor-proxy without the proxy's 0-arg types. */
const NativeDeviceAuth: DeviceAuthPluginInterface = {
  getStatus: () => registered.getStatus() as Promise<DeviceStatus>,
  ensureKeyPair: () => registered.ensureKeyPair() as Promise<DeviceKeyPair>,
  startActivationServer: (options?: { port?: number }) =>
    (registered as { startActivationServer(o?: { port?: number }): Promise<void> }).startActivationServer(options),
  stopActivationServer: () =>
    (registered as { stopActivationServer(): Promise<void> }).stopActivationServer(),
  deactivate: () => (registered as { deactivate(): Promise<void> }).deactivate(),
  addListener: (event, cb) =>
    (registered as {
      addListener(e: 'deviceActivated' | 'deviceDeactivated', f: () => void): Promise<ListenerHandle>
    }).addListener(event, cb),
}

/** True when running inside a native (Capacitor Android) container. */
export function isNativePlatform(): boolean {
  return Capacitor.getPlatform() !== 'web'
}

/**
 * The adapter. On native, every call goes to the real plugin bridge; on a
 * genuinely non-native target it is a no-op pass-through that reports
 * `supported: false` (no gate — the sanctioned web exception).
 *
 * getStatus is additionally hardened: on a native platform, ANY answer of
 * `supported: false` (a broken/mis-registered plugin) is converted into a
 * thrown error so the service fails closed to `unauthorized`. `unsupported`
 * is therefore UNREACHABLE on Android through any path.
 */
export const capacitorDeviceAuth: DeviceAuthAdapter = {
  getStatus: async () => {
    if (!isNativePlatform()) {
      return webAdapter.getStatus()
    }
    const status = await NativeDeviceAuth.getStatus()
    if (!status.supported) {
      throw new Error('DeviceAuth native plugin reported unsupported — failing closed')
    }
    return status
  },
  ensureKeyPair: () => (isNativePlatform() ? NativeDeviceAuth.ensureKeyPair() : webAdapter.ensureKeyPair()),
  startActivationServer: (options?) =>
    isNativePlatform()
      ? NativeDeviceAuth.startActivationServer(options as { port?: number } | undefined)
      : webAdapter.startActivationServer(options),
  stopActivationServer: () =>
    isNativePlatform() ? NativeDeviceAuth.stopActivationServer() : webAdapter.stopActivationServer(),
  deactivate: () => (isNativePlatform() ? NativeDeviceAuth.deactivate() : webAdapter.deactivate()),
  addListener: (event, cb) =>
    isNativePlatform()
      ? NativeDeviceAuth.addListener(event as 'deviceActivated' | 'deviceDeactivated', cb)
      : webAdapter.addListener(event, cb),
}

/**
 * Device authorization store — startup gate state (PROJECT_SPEC §6.4/§6.5).
 *
 * Gate order: Device Authorization → App Lock → Paddy app. Authorization state
 * is the master-signed certificate fingerprint persisted in the settings table
 * (`device.fp`, `device.cert`); the matching private key is non-exportable in
 * the Android Keystore, so a copied APK on another device cannot satisfy the
 * check. Web/desktop adapters report `supported: false` → no gate.
 *
 * Zustand is justified here: this state is genuinely shared between the
 * startup gate (`app/App.tsx`) and the Settings session
 * (`features/security/DeviceActivationTab`) — both must show the SAME real
 * authorization state. The store lives in `services/device-auth` because that
 * is the only layer both the app gate and the feature may depend on.
 *
 * Reference semantics (~/paddyprice/src/store/useDeviceAuthStore.ts) preserved
 * exactly: fail-safe to `unauthorized` on check errors; `unsupported` never
 * gates and never becomes authorized without a real adapter event.
 */
import { create } from 'zustand'
import type { DeviceAuthAdapter, DeviceAuthState } from '@/types'
import { getDatabase } from '@/infrastructure/db'
import { capacitorDeviceAuth } from '@/infrastructure/platform/deviceAuth/capacitorDeviceAuth'
import {
  createDeviceAuthService,
  deviceAuthPersistence,
  log,
  DEVICE_KEY_CERT,
  DEVICE_KEY_FP,
  type DeviceAuthService,
} from './service'

export interface DeviceAuthStoreState {
  state: DeviceAuthState
  /** True while the loopback activation server is running and waiting. */
  activating: boolean
  /** SHA-256 fingerprint of this device's public key (when known). */
  fingerprint: string | null
  error: string | null

  /** Check the real authorization state (native status + persisted settings). */
  initialize(): Promise<void>
  /** Start the loopback activation server and wait for the activation event. */
  beginActivation(): Promise<void>
  /**
   * Cancel the CURRENT activation attempt. SECURITY INVARIANT: cancelling is
   * NOT authorization — it only stops the loopback server and clears the
   * transient wait flag. It never writes `device.fp`/`device.cert`, never
   * flips `state` to 'authorized', and can never unlock the application. The
   * device remains unauthorized and the DeviceGate stays up.
   */
  cancelActivation(): Promise<void>
  /** Deactivate locally: clear plugin key state + persisted settings. */
  deactivateLocal(): Promise<void>
}

export interface DeviceAuthStoreDeps {
  adapter: DeviceAuthAdapter
  /**
   * Persistence for the `device.*` settings. Called lazily (not at store
   * creation) so the store can be a module-level singleton while the app
   * database is still initializing.
   */
  persistence: () => { getSetting(key: string): string | null; setSetting(key: string, value: string): void }
}

/** Create a device-auth store over explicit deps (the testable factory). */
export function createDeviceAuthStore(deps: DeviceAuthStoreDeps) {
  return create<DeviceAuthStoreState>()((set) => {
    let service: DeviceAuthService | null = null

    const getService = (): DeviceAuthService => {
      if (!service) {
        const { getSetting, setSetting } = deps.persistence()
        service = createDeviceAuthService({
          adapter: deps.adapter,
          getSetting,
          setSetting,
          // Native `deviceActivated` fires after the installer posts a valid,
          // master-signed certificate through the loopback server. The service
          // persists `device.fp`/`device.cert`; the store reflects the SAME
          // transition so the startup gate opens and Settings shows Authorized.
          onActivated: (fp) => {
            log('deviceActivated event — authorization positively verified')
            set({ state: 'authorized', activating: false, fingerprint: fp, error: null })
          },
          onDeactivated: () => {
            log('deviceDeactivated event — fail closed to unauthorized')
            set({ state: 'unauthorized', activating: false, fingerprint: null })
          },
        })
      }
      return service
    }

    return {
      state: 'checking',
      activating: false,
      fingerprint: null,
      error: null,

      initialize: async () => {
        try {
          log('initialize start')
          const result = await getService().check()
          log(`initialize result: ${result.state}`)
          set({ state: result.state, fingerprint: result.fingerprint, error: result.error })
        } catch (err) {
          // Fail safe on Android: block rather than leak data. Web never reaches
          // this path (getStatus resolves supported=false there).
          log('initialize failed — fail closed to unauthorized')
          set({
            state: 'unauthorized',
            activating: false,
            fingerprint: null,
            error: err instanceof Error ? err.message : 'Device authorization check failed',
          })
        }
      },

      beginActivation: async () => {
        try {
          // Web/unsupported: never start anything and never fake a wait state.
          const current = await getService().check()
          if (current.state === 'unsupported') {
            log('beginActivation on an unsupported platform — ignored')
            set({ state: 'unsupported', activating: false, fingerprint: null, error: null })
            return
          }
          log('beginActivation: starting loopback activation server')
          set({ error: null })
          await getService().beginActivation()
          set({ activating: true })
        } catch (err) {
          log('beginActivation failed — not authorized')
          set({
            activating: false,
            error: err instanceof Error ? err.message : 'Failed to start activation',
          })
        }
      },

      cancelActivation: async () => {
        // SECURITY INVARIANT: cancel ≠ authorize. This stops the current
        // activation attempt AND removes event listeners so any pending
        // deviceActivated event that was already in flight when the user
        // pressed Cancel can NEVER fire onActivated afterwards and unlock
        // the application. The device remains unauthorized; there is no
        // code path here that can produce `state: 'authorized'`.
        try {
          await getService().cancelActivation()
        } catch {
          // best-effort — server or listeners may already be gone
          // fall through to fail-closed below
        }
        // Fail closed: explicitly set state to unauthorized so the
        // startup gate and the Settings UI both show the security notice.
        // Even if some native side had already persisted the fingerprint,
        // removing the listeners guarantees onActivated can never fire
        // again from this activation attempt.
        set({ state: 'unauthorized', activating: false, fingerprint: null, error: null })
        log('activation cancelled — device remains unauthorized (failed closed)')
      },

      deactivateLocal: async () => {
        try {
          await getService().deactivate()
          // Native deactivation succeeded: the plugin cleared the Keystore
          // key + native prefs, and the service cleared the persisted
          // settings. ONLY now may the runtime state transition to
          // unauthorized — the reference store does the same (unauthorized is
          // set strictly after a successful native deactivate). There is no
          // JS-only revoke: if the native call had failed, we must not claim
          // unauthorized while the native layer still reports authorized,
          // because the next startup would re-read native and reopen the app.
          try {
            // Belt-and-suspenders: guarantee the persisted authorization
            // material is gone so a restart cannot mis-trust stale settings.
            const { setSetting } = deps.persistence()
            setSetting(DEVICE_KEY_FP, '')
            setSetting(DEVICE_KEY_CERT, '')
          } catch {
            // database may be unavailable — the native clear already
            // guarantees the next startup reports unauthorized
          }
          log('device deactivated — fail closed to unauthorized')
          set({ state: 'unauthorized', activating: false, fingerprint: null })
        } catch (err) {
          // Native deactivation FAILED → the device state is UNCHANGED. Do
          // not fabricate a JS-only "unauthorized" (that exact discrepancy is
          // what lets a restart reopen the app). Re-read the REAL native
          // state so the store reflects the authoritative result, and surface
          // the error so the user knows the deactivation did not complete.
          const message = err instanceof Error ? err.message : 'Device deactivation failed'
          log('device deactivation failed — native state unchanged, re-checking')
          try {
            const result = await getService().check()
            // Reflect the REAL native state, but keep the deactivation failure
            // visible so the user knows the revoke did not complete.
            set({ state: result.state, fingerprint: result.fingerprint, error: message })
          } catch {
            // Even the re-check failed → fail closed (never authorized on
            // uncertainty) with the deactivation error visible.
            set({ state: 'unauthorized', activating: false, fingerprint: null, error: message })
          }
        }
      },
    }
  })
}

/** Default persistence: the app database's settings DAO (available post-bootstrap). */
function defaultPersistence() {
  return deviceAuthPersistence(getDatabase())
}

/**
 * Default singleton wired to the real Capacitor adapter and the app database.
 * Both the startup gate and the Settings session consume this single instance.
 */
export const useDeviceAuthStore = createDeviceAuthStore({
  adapter: capacitorDeviceAuth,
  persistence: defaultPersistence,
})

export { DEVICE_KEY_CERT, DEVICE_KEY_FP }

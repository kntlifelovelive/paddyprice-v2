/**
 * Device Authorization service (docs/PROJECT_SPEC.md §6.4) — orchestration on
 * top of the `DeviceAuthAdapter` platform port.
 *
 * Flow: challenge → sign (PC installer) → verify (native plugin) → persist
 * authorization state (`device.fp` + `device.cert` settings). The matching
 * private key never leaves the Android Keystore; a copied APK on another
 * device cannot pass. Desktop/web adapters report `supported: false` → the
 * gate is skipped (`unsupported`).
 *
 * Boundary (not confirmed, not invented here — §6.4): the exact `keypass.txt`
 * contents/format, the certificate byte layout/encoding, and installer script
 * internals are PC-side only. The documented flow above is the contract.
 */
import type { Database } from 'sql.js'
import type { DeviceAuthAdapter, DeviceAuthState } from '@/types'
import { getSetting, setSetting } from '@/infrastructure/db/dao/settings'
import { DEVICE_AUTH_CHECK_FAILED } from '@/services/security/messages'

/** Persisted authorization settings keys (§6.4). */
export const DEVICE_KEY_FP = 'device.fp'
export const DEVICE_KEY_CERT = 'device.cert'

export interface DeviceAuthCheckResult {
  state: DeviceAuthState
  /** SHA-256 fingerprint of this device's public key, when known. */
  fingerprint: string | null
  error: string | null
}

export interface DeviceAuthService {
  /** Device authorization check (gate 1 of the documented order). */
  check(): Promise<DeviceAuthCheckResult>
  /** Start the loopback activation server and wire the activation listeners. */
  beginActivation(): Promise<void>
  /** Deactivate locally: clear the plugin key state and persisted settings. */
  deactivate(): Promise<void>
  stopActivationServer(): Promise<void>
}

export interface DeviceAuthServiceOptions {
  adapter: DeviceAuthAdapter
  /** Persistence for `device.*` settings (settings DAO bound to the app DB). */
  getSetting: (key: string) => string | null
  setSetting: (key: string, value: string) => void
  /** Called when the device becomes authorized (native `deviceActivated`). */
  onActivated?: (fingerprint: string | null) => void
  /** Called when the device becomes unauthorized. */
  onDeactivated?: () => void
}

export function createDeviceAuthService(options: DeviceAuthServiceOptions): DeviceAuthService {
  const { adapter, getSetting: get, setSetting: set, onActivated, onDeactivated } = options

  return {
    async check(): Promise<DeviceAuthCheckResult> {
      try {
        const status = await adapter.getStatus()
        if (!status.supported) {
          // Desktop / web — no gate.
          return { state: 'unsupported', fingerprint: null, error: null }
        }
        const storedFp = get(DEVICE_KEY_FP)
        const storedCert = get(DEVICE_KEY_CERT)
        if (!status.hasKey || !status.savedFp || !storedFp || !storedCert) {
          // Never activated, or app data cleared while the Keystore key remains.
          return { state: 'unauthorized', fingerprint: status.savedFp, error: null }
        }
        if (storedFp !== status.savedFp) {
          // Mismatch between DB and native state → treat as unauthorized.
          return { state: 'unauthorized', fingerprint: status.savedFp, error: null }
        }
        return { state: 'authorized', fingerprint: storedFp, error: null }
      } catch {
        // Fail safe on Android: block rather than leak data. Desktop never
        // reaches this path (getStatus resolves supported=false there).
        return { state: 'unauthorized', fingerprint: null, error: DEVICE_AUTH_CHECK_FAILED }
      }
    },

    async beginActivation(): Promise<void> {
      await adapter.startActivationServer()
      // Fired by the native plugin after a master-signed certificate is
      // verified through the loopback activation server.
      await adapter.addListener('deviceActivated', () => {
        void (async () => {
          const { savedFp } = await adapter.getStatus()
          if (savedFp) {
            set(DEVICE_KEY_FP, savedFp)
            set(DEVICE_KEY_CERT, JSON.stringify({ fp: savedFp, at: Date.now() }))
          }
          onActivated?.(savedFp)
        })()
      })
      await adapter.addListener('deviceDeactivated', () => {
        try {
          set(DEVICE_KEY_FP, '')
          set(DEVICE_KEY_CERT, '')
        } catch {
          // database may be unavailable mid-teardown — ignore
        }
        onDeactivated?.()
      })
    },

    async deactivate(): Promise<void> {
      await adapter.deactivate()
      try {
        set(DEVICE_KEY_FP, '')
        set(DEVICE_KEY_CERT, '')
      } catch {
        // ignore — same fail-safe as the deactivated event
      }
      onDeactivated?.()
    },

    async stopActivationServer(): Promise<void> {
      await adapter.stopActivationServer()
    },
  }
}

/** Bind the service persistence to the app database's settings DAO. */
export function deviceAuthPersistence(db: Database): {
  getSetting: (key: string) => string | null
  setSetting: (key: string, value: string) => void
} {
  return {
    getSetting: (key) => getSetting(db, key),
    setSetting: (key, value) => setSetting(db, key, value),
  }
}

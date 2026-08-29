/**
 * Platform ports — environment, biometric, and device authorization.
 * src/types foundation (Step 3). Type-only contracts (capabilities + data
 * shapes only). No implementations — adapters come later in
 * `infrastructure/platform`.
 */

/* ------------------------------------------------------------------ */
/* Environment / capability detection                                  */
/* ------------------------------------------------------------------ */

/** Capability detection result a service needs to choose an adapter. */
export interface PlatformInfo {
  /** 'web' (browser/desktop web), 'android' (Capacitor), 'electron'. */
  kind: 'web' | 'android' | 'electron'
  /** True when running inside a Capacitor native container. */
  isNativePlatform: boolean
}

/* ------------------------------------------------------------------ */
/* Biometric (fingerprint)                                             */
/* ------------------------------------------------------------------ */

/** Detailed biometric capability of the current device/platform. */
export type BiometricStatus =
  | 'available'
  | 'no_hardware'
  | 'not_enrolled'
  | 'temporarily_unavailable'
  | 'unsupported_platform'
  | 'unknown'

/** Per-modality report from the OS (fingerprint only — Face Lock is not supported). */
export interface BiometricModality {
  /** The device has this kind of sensor. */
  supported: boolean
  /** The user has enrolled it in the OS settings. */
  enrolled: boolean
}

export interface BiometricCapabilities {
  status: BiometricStatus
  fingerprint: BiometricModality
}

export interface BiometricAuthenticateOptions {
  title: string
  subtitle?: string
  /** Shown for the negative button of the system dialog. */
  cancelLabel?: string
}

export interface BiometricResult {
  /** True only when the OS reported successful authentication. */
  success: boolean
  /** True when the user explicitly cancelled the prompt. */
  cancelled: boolean
}

/** Port for the Android system biometric prompt (fingerprint). */
export interface BiometricAdapter {
  getStatus(): Promise<BiometricCapabilities>
  /** True when the device can show a biometric prompt right now. */
  isAvailable(): Promise<boolean>
  /** Show the system biometric prompt. */
  authenticate(options: BiometricAuthenticateOptions): Promise<BiometricResult>
  /** Open the OS enrollment screen (Settings) for fingerprints. */
  openEnrollment(): Promise<void>
}

/* ------------------------------------------------------------------ */
/* Device authorization (Android Keystore + loopback activation)       */
/* ------------------------------------------------------------------ */

/** Device state reported by the native device-authorization plugin. */
export interface DeviceStatus {
  /** Platform supports Keystore-based device authorization (Android only). */
  supported: boolean
  /** A Keystore key pair exists. */
  hasKey: boolean
  /** Saved public-key fingerprint (nullable when none). */
  savedFp: string | null
}

/** Result of ensuring a key pair. */
export interface DeviceKeyPair {
  /** SHA-256 fingerprint of the public key. */
  fp: string
  /** DER-PKIX (SPKI) bytes of the public key, base64. */
  spkiB64: string
}

/** Minimal listener handle (mirrors Capacitor's PluginListenerHandle). */
export interface ListenerHandle {
  remove(): Promise<void>
}

/** Port for the native device-authorization plugin (Android). */
export interface DeviceAuthAdapter {
  getStatus(): Promise<DeviceStatus>
  /** Generate (or return) the non-exportable EC P-256 key pair in Android Keystore. */
  ensureKeyPair(): Promise<DeviceKeyPair>
  /** Start the loopback activation server (port 18777) reachable via `adb forward`. */
  startActivationServer(options?: { port?: number }): Promise<void>
  stopActivationServer(): Promise<void>
  deactivate(): Promise<void>
  addListener(
    eventName: 'deviceActivated' | 'deviceDeactivated',
    listenerFunc: () => void,
  ): Promise<ListenerHandle>
}
/**
 * Security application contracts — App Lock configuration and device
 * authorization state (docs/PROJECT_SPEC.md §6, docs/ARCHITECTURE.md §3.1).
 * Type-only; behavior lives in `src/services/security` and
 * `src/services/device-auth`.
 */

/** App Lock credential methods (fingerprint = the only biometric modality). */
export type LockMethod = 'pattern' | 'pin' | 'fingerprint'

/** Auto-lock timeout options — seconds after backgrounding; 0 = immediately. */
export type AutoLockTimeout = 'immediately' | '60' | '300' | '900'

/** Device authorization gate state machine (§6.5). */
export type DeviceAuthState = 'checking' | 'unsupported' | 'unauthorized' | 'authorized'

/** Persisted App Lock configuration (no secrets — only presence flags). */
export interface SecurityConfig {
  /** Master switch — the app locks when true. */
  enabled: boolean
  /** A pattern verifier exists. */
  hasPattern: boolean
  /** A PIN verifier exists. */
  hasPin: boolean
  /** Biometric unlock allowed (device support is checked separately). */
  biometric: boolean
  /** Fingerprint unlock specifically enabled. */
  biometricFingerprint: boolean
  timeout: AutoLockTimeout
}

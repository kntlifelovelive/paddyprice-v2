/**
 * App Lock orchestration + persistence (docs/PROJECT_SPEC.md §6.2–§6.3).
 *
 * Persistence: verifier strings only — raw PIN/pattern secrets are NEVER
 * stored. Settings keys and the `'1'/'0'` flag encoding are the documented
 * reference behavior; the legacy `security.biometric` key migrates to the
 * fingerprint key on read (it was the only biometric modality).
 *
 * Fail-safes (confirmed reference behavior): App Lock enabled with no
 * credentials never locks the user out; removing the last credential
 * auto-disables App Lock and clears the biometric helper.
 *
 * Orchestration is framework-light (no React/Zustand): the future gate/feature
 * layer owns this service, re-reads the config when settings change, and
 * renders the UI.
 */
import type { Database } from 'sql.js'
import type { AutoLockTimeout, SecurityConfig } from '@/types'
import { deleteSetting, getSetting, setSetting } from '@/infrastructure/db/dao/settings'
import { autoLockTimeoutMs, parseAutoLockTimeout } from './auto-lock'
import type { BiometricService } from './biometric'
import { createAttemptThrottle } from './throttle'
import { createVerifier, isValidPattern, isValidPin, patternToSecret, verifySecret } from './verifier'

export const SECURITY_KEY_ENABLED = 'security.enabled'
export const SECURITY_KEY_PATTERN = 'security.pattern'
export const SECURITY_KEY_PIN = 'security.pin'
/** Legacy pre-V2 flag; on read it means fingerprint was enabled. */
export const SECURITY_KEY_BIOMETRIC_LEGACY = 'security.biometric'
export const SECURITY_KEY_BIOMETRIC_FINGERPRINT = 'security.biometric.fingerprint'
export const SECURITY_KEY_TIMEOUT = 'security.timeout'

function readFlag(db: Database, key: string): boolean {
  return getSetting(db, key) === '1'
}

function writeFlag(db: Database, key: string, value: boolean): void {
  setSetting(db, key, value ? '1' : '0')
}

/**
 * Whether App Lock has any credential that can lock the app. Fingerprint is an
 * unlock HELPER, not a credential — it requires a pattern/PIN to be configured
 * first — so the fail-safe counts pattern/PIN verifiers only (confirmed
 * reference behavior).
 */
export function hasAnyCredential(config: SecurityConfig): boolean {
  return config.hasPattern || config.hasPin
}

/** Read the persisted App Lock configuration (no secrets — presence flags only). */
export function readSecurityConfig(db: Database): SecurityConfig {
  const hasPattern = getSetting(db, SECURITY_KEY_PATTERN) !== null
  const hasPin = getSetting(db, SECURITY_KEY_PIN) !== null
  const legacyRaw = getSetting(db, SECURITY_KEY_BIOMETRIC_LEGACY)
  const fingerprintRaw = getSetting(db, SECURITY_KEY_BIOMETRIC_FINGERPRINT)
  // Legacy migration: `security.biometric` predates per-modality keys and
  // means fingerprint was enabled; the explicit fingerprint key wins when set.
  const biometricFingerprint = fingerprintRaw !== null ? fingerprintRaw === '1' : legacyRaw === '1'
  const biometric = legacyRaw !== null ? legacyRaw === '1' : biometricFingerprint
  return {
    enabled: readFlag(db, SECURITY_KEY_ENABLED),
    hasPattern,
    hasPin,
    biometric,
    biometricFingerprint,
    timeout: parseAutoLockTimeout(getSetting(db, SECURITY_KEY_TIMEOUT)),
  }
}

export function setSecurityEnabled(db: Database, enabled: boolean): void {
  writeFlag(db, SECURITY_KEY_ENABLED, enabled)
}

/** Persist a pattern verifier (draw order is significant — §6.2). */
export async function savePattern(db: Database, points: number[]): Promise<void> {
  if (!isValidPattern(points)) throw new Error('Invalid pattern: at least 4 unique dots required')
  setSetting(db, SECURITY_KEY_PATTERN, await createVerifier(patternToSecret(points)))
}

/** Persist a PIN verifier (4–8 digits; arbitrary passwords are not accepted). */
export async function savePin(db: Database, pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error('Invalid PIN: 4-8 digits required')
  setSetting(db, SECURITY_KEY_PIN, await createVerifier(pin))
}

function autoDisableIfNoCredentials(db: Database): void {
  if (!readFlag(db, SECURITY_KEY_ENABLED)) return
  if (hasAnyCredential(readSecurityConfig(db))) return
  // Fail-safe: no credential can ever unlock again → disable the lock and
  // clear the biometric helper (documented reference behavior).
  writeFlag(db, SECURITY_KEY_ENABLED, false)
  deleteSetting(db, SECURITY_KEY_BIOMETRIC_LEGACY)
  writeFlag(db, SECURITY_KEY_BIOMETRIC_FINGERPRINT, false)
}

export function clearPattern(db: Database): void {
  deleteSetting(db, SECURITY_KEY_PATTERN)
  autoDisableIfNoCredentials(db)
}

export function clearPin(db: Database): void {
  deleteSetting(db, SECURITY_KEY_PIN)
  autoDisableIfNoCredentials(db)
}

export function setFingerprintEnabled(db: Database, enabled: boolean): void {
  // No auto-disable here: toggling the biometric HELPER is not a credential
  // change. The fail-safe fires only when a credential is removed.
  writeFlag(db, SECURITY_KEY_BIOMETRIC_FINGERPRINT, enabled)
}

export function setSecurityTimeout(db: Database, timeout: AutoLockTimeout): void {
  setSetting(db, SECURITY_KEY_TIMEOUT, timeout)
}

/* ------------------------------------------------------------------ */
/* Security change bus (framework-light)                              */
/* ------------------------------------------------------------------ */

/**
 * Tiny module-level notification bus so the App Lock GATE (mounted once in
 * `app/App.tsx`) can re-read the persisted config after the Settings UI writes
 * to it, and so the Lock Now action can reach the gate from inside the router.
 * Keeps the service framework-light (no React/Zustand, matching the rest of
 * this module).
 */
export type SecurityEvent = 'changed' | 'lock-now'

const securityEventListeners = new Set<(event: SecurityEvent) => void>()

/** Subscribe to security-config/lock-now events; returns the unsubscribe fn. */
export function subscribeSecurityEvent(listener: (event: SecurityEvent) => void): () => void {
  securityEventListeners.add(listener)
  return () => {
    securityEventListeners.delete(listener)
  }
}

/** Notify subscribers that the persisted security config changed (or lock now). */
export function emitSecurityEvent(event: SecurityEvent): void {
  securityEventListeners.forEach((listener) => listener(event))
}

/* ------------------------------------------------------------------ */
/* Runtime lock service (framework-light; owned by the gate layer)     */
/* ------------------------------------------------------------------ */

export interface AppLockState {
  /** True when the gate must be shown (§6.2 lock predicate). */
  locked: boolean
  /** True while the attempt throttle cooldown is active. */
  blocked: boolean
  /** Ms remaining in the cooldown; 0 when not blocked. */
  remainingMs: number
  /** Consecutive failed pattern/PIN attempts since the last success. */
  failures: number
}

export interface AppLockServiceOptions {
  config: SecurityConfig
  /** Stored verifier strings (loaded by the gate layer, not by this service). */
  patternVerifier: string | null
  pinVerifier: string | null
  /** Fingerprint service (optional — omitted on web/desktop test contexts). */
  biometric?: BiometricService
  now?: () => number
  /**
   * Start already-unlocked (session carry-over). The app STARTS locked when
   * the gate builds at startup (default `false` — confirmed reference
   * behavior); the gate rebuilds its service on Settings changes while the
   * session is unlocked, and that must NOT lock the running session
   * (reference: `setEnabled` keeps `locked` unchanged; the lock engages on
   * next startup, after a background timeout, or via Lock Now).
   */
  startUnlocked?: boolean
}

export interface AppLockService {
  readonly config: SecurityConfig
  getState(): AppLockState
  isLocked(): boolean
  unlockWithPattern(points: number[]): Promise<boolean>
  unlockWithPin(pin: string): Promise<boolean>
  /** Fingerprint unlock; never feeds the throttle (§6.2: pattern/PIN paths only). */
  unlockWithFingerprint(): Promise<boolean>
  lock(): void
  /** Lock immediately, ignoring the auto-lock timeout ("Lock Now"). */
  lockNow(): void
  /** Auto-lock policy hooks driven by background/foreground events. */
  onBackground(): void
  onForeground(): void
  subscribe(listener: (state: AppLockState) => void): () => void
}

export function createAppLockService(options: AppLockServiceOptions): AppLockService {
  const { config, patternVerifier, pinVerifier, biometric, now = Date.now } = options
  const throttle = createAttemptThrottle()
  let unlocked = options.startUnlocked === true
  let backgroundedAt: number | null = null
  const listeners = new Set<(state: AppLockState) => void>()

  /**
   * Fail-safe lock predicate: the gate may only lock when App Lock is enabled,
   * a pattern/PIN credential is configured, AND at least one verifier is
   * actually loaded. If the config claims a credential but its verifier is
   * unavailable (e.g. unloadable/corrupted), locking would lock the user out
   * with no way back in — so the app stays unlocked (documented fail-safe).
   */
  const canLock = (): boolean =>
    config.enabled &&
    hasAnyCredential(config) &&
    (patternVerifier !== null || pinVerifier !== null)

  const getState = (): AppLockState => ({
    locked: canLock() && !unlocked,
    blocked: throttle.isBlocked(now()),
    remainingMs: throttle.remainingMs(now()),
    failures: throttle.snapshot().failures,
  })

  const notify = (): void => {
    const state = getState()
    listeners.forEach((listener) => listener(state))
  }

  const attempt = async (secret: string, verifier: string | null): Promise<boolean> => {
    if (!canLock() || unlocked) return true
    // Blocked attempts are rejected without verification and without
    // counting as new failures.
    if (throttle.isBlocked(now())) return false
    const ok = await verifySecret(secret, verifier)
    if (ok) {
      throttle.reset()
      unlocked = true
      notify()
      return true
    }
    throttle.recordFailure(now())
    notify()
    return false
  }

  return {
    config,
    getState,
    isLocked: () => getState().locked,

    unlockWithPattern(points: number[]): Promise<boolean> {
      if (!isValidPattern(points)) {
        if (!canLock() || unlocked) return Promise.resolve(true)
        throttle.recordFailure(now())
        notify()
        return Promise.resolve(false)
      }
      return attempt(patternToSecret(points), patternVerifier)
    },

    unlockWithPin(pin: string): Promise<boolean> {
      if (!isValidPin(pin)) {
        if (!canLock() || unlocked) return Promise.resolve(true)
        throttle.recordFailure(now())
        notify()
        return Promise.resolve(false)
      }
      return attempt(pin, pinVerifier)
    },

    async unlockWithFingerprint(): Promise<boolean> {
      if (!canLock() || unlocked) return true
      // Fingerprint must be both configured and device-supported; the
      // fail-safe biometric service never fakes support.
      if (!config.biometricFingerprint || !biometric) return false
      // English-only security presentation contract (§6.7): the biometric
      // service defaults the prompt title to the exact `Security Lock`.
      const result = await biometric.authenticate()
      if (result.success === true) {
        unlocked = true
        notify()
        return true
      }
      return false
    },

    lock(): void {
      unlocked = false
      notify()
    },
    lockNow(): void {
      backgroundedAt = null
      this.lock()
    },
    onBackground(): void {
      backgroundedAt = now()
    },
    onForeground(): void {
      if (backgroundedAt === null) return
      const elapsed = now() - backgroundedAt
      backgroundedAt = null
      if (elapsed >= autoLockTimeoutMs(config.timeout)) this.lock()
    },
    subscribe(listener: (state: AppLockState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}


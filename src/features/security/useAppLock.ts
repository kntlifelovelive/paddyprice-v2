/**
 * useAppLock — React hook bridging the framework-light App Lock service
 * (`src/services/security/app-lock`) into the gate layer.
 *
 * Lifecycle:
 *  1. On mount, read the persisted SecurityConfig + verifiers from the DB.
 *  2. Construct an `AppLockService` instance.
 *  3. Subscribe to state changes; on every change, re-render the consumer.
 *  4. On unmount, unsubscribe and dispose.
 *
 * The hook is the ONLY place that reads the security settings DB. The lock
 * screen and settings UI consume `state`/`actions` from this hook only.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Database } from 'sql.js'
import { getDatabase } from '@/infrastructure/db'
import {
  createAppLockService,
  readSecurityConfig,
  SECURITY_KEY_PATTERN,
  SECURITY_KEY_PIN,
  subscribeSecurityEvent,
} from '@/services/security/app-lock'
import type { AppLockService, AppLockState } from '@/services/security/app-lock'
import { getSetting } from '@/infrastructure/db/dao/settings'

export interface UseAppLockResult {
  /** True when the gate is locked (a credential is set + not unlocked). */
  locked: boolean
  blocked: boolean
  remainingMs: number
  failures: number
  /** Attempt to unlock with a pattern (draw order). */
  unlockWithPattern(points: number[]): Promise<boolean>
  /** Attempt to unlock with a PIN. */
  unlockWithPin(pin: string): Promise<boolean>
  /** True when at least one credential is persisted. */
  hasCredential: boolean
  /** Whether a pattern verifier exists. */
  hasPattern: boolean
  /** Whether a PIN verifier exists. */
  hasPin: boolean
  /** Reload the persisted configuration (call after Save in Settings). */
  refresh(): void
}

function loadVerifiers(db: Database): { pattern: string | null; pin: string | null } {
  return {
    pattern: getSetting(db, SECURITY_KEY_PATTERN),
    pin: getSetting(db, SECURITY_KEY_PIN),
  }
}

export function useAppLock(): UseAppLockResult {
  const [tick, setTick] = useState(0)
  const serviceRef = useRef<AppLockService | null>(null)
  const configRef = useRef<ReturnType<typeof readSecurityConfig> | null>(null)

  function buildService(): AppLockService {
    const db = getDatabase()
    const config = readSecurityConfig(db)
    const verifiers = loadVerifiers(db)
    configRef.current = config
    return createAppLockService({
      config,
      patternVerifier: verifiers.pattern,
      pinVerifier: verifiers.pin,
    })
  }

  // Construct + subscribe (guarded: DB may not be ready during test bootstrap).
  // Also subscribe to the security change bus so Settings mutations (set PIN,
  // change PIN, remove PIN, enable/disable, timeout…) rebuild this gate's
  // service immediately — otherwise changes would only apply after a reload.
  // Auto-lock: track document visibility so backgrounding → foreground relocks
  // per the configured timeout on BOTH web and Android WebView.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let unsubscribeBus: (() => void) | undefined
    try {
      serviceRef.current = buildService()
      unsubscribe = serviceRef.current.subscribe(() => setTick((n) => n + 1))
      unsubscribeBus = subscribeSecurityEvent((event) => {
        if (event === 'lock-now') {
          serviceRef.current?.lockNow()
          return
        }
        // 'changed' → rebuild the service from the persisted config and
        // re-evaluate the lock state so Settings changes apply immediately.

        const sub = serviceRef.current?.subscribe(() => setTick((n) => n + 1))
        serviceRef.current = buildService()
        sub?.()
        setTick((n) => n + 1)
      })
      setTick((n) => n + 1)
    } catch {
      // DB not initialized (test environment or early bootstrap) — stay unlocked
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        serviceRef.current?.onBackground()
      } else if (document.visibilityState === 'visible') {
        serviceRef.current?.onForeground()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      unsubscribeBus?.()
      unsubscribe?.()
      serviceRef.current = null
    }
  }, [])

  const state: AppLockState = useMemo(() => {
    if (!serviceRef.current) {
      return { locked: false, blocked: false, remainingMs: 0, failures: 0 }
    }
    return serviceRef.current.getState()
  }, [serviceRef.current, tick]) // tick triggers re-evaluation; see setTick

  const refresh = (): void => {
    if (serviceRef.current) {
      const sub = serviceRef.current.subscribe(() => setTick((n) => n + 1))
      sub()
    }
    serviceRef.current = buildService()
    setTick((n) => n + 1)
  }

  const config = configRef.current
  const hasPattern = config?.hasPattern ?? false
  const hasPin = config?.hasPin ?? false

  return {
    locked: state.locked,
    blocked: state.blocked,
    remainingMs: state.remainingMs,
    failures: state.failures,
    unlockWithPattern: (p) => serviceRef.current?.unlockWithPattern(p) ?? Promise.resolve(false),
    unlockWithPin: (p) => serviceRef.current?.unlockWithPin(p) ?? Promise.resolve(false),
    hasCredential: hasPattern || hasPin,
    hasPattern,
    hasPin,
    refresh,
  }
}

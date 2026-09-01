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

export function useAppLock(options: { dbReady?: boolean } = {}): UseAppLockResult {
  // `dbReady` gates the FIRST service build: bootstrap runs asynchronously
  // after mount (`main.tsx`), and `getDatabase()` throws until init completes.
  // The effect below re-runs when the DB becomes ready so the gate actually
  // engages on Web and Android — without this, the build attempt at mount
  // fails silently and the lock can never appear.
  const { dbReady = true } = options
  const [tick, setTick] = useState(0)
  const serviceRef = useRef<AppLockService | null>(null)
  const configRef = useRef<ReturnType<typeof readSecurityConfig> | null>(null)

  function buildService(startUnlocked: boolean): AppLockService {
    const db = getDatabase()
    const config = readSecurityConfig(db)
    const verifiers = loadVerifiers(db)
    configRef.current = config
    return createAppLockService({
      config,
      patternVerifier: verifiers.pattern,
      pinVerifier: verifiers.pin,
      startUnlocked,
    })
  }

  // Construct + subscribe (guarded: DB may not be ready during test bootstrap).
  // Also subscribe to the security change bus so Settings mutations (set PIN,
  // change PIN, remove PIN, enable/disable, timeout…) rebuild this gate's
  // service immediately — otherwise changes would only apply after a reload.
  // A rebuild while the session is UNLOCKED must not lock it (confirmed
  // reference behavior): the lock engages on next startup, after a background
  // timeout, or via Lock Now.
  // Auto-lock: track document visibility so backgrounding → foreground relocks
  // per the configured timeout on BOTH web and Android WebView.
  useEffect(() => {
    if (!dbReady) return
    let unsubscribe: (() => void) | undefined
    let unsubscribeBus: (() => void) | undefined
    try {
      serviceRef.current = buildService(false)
      unsubscribe = serviceRef.current.subscribe(() => setTick((n) => n + 1))
      unsubscribeBus = subscribeSecurityEvent((event) => {
        if (event === 'lock-now') {
          serviceRef.current?.lockNow()
          return
        }
        // 'changed' → rebuild the service from the persisted config and
        // re-evaluate the lock state so Settings changes apply immediately.
        const wasUnlocked =
          serviceRef.current !== null && !serviceRef.current.getState().locked

        const sub = serviceRef.current?.subscribe(() => setTick((n) => n + 1))
        serviceRef.current = buildService(wasUnlocked)
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
  }, [dbReady])

  const state: AppLockState = useMemo(() => {
    if (!serviceRef.current) {
      return { locked: false, blocked: false, remainingMs: 0, failures: 0 }
    }
    return serviceRef.current.getState()
  }, [serviceRef.current, tick]) // tick triggers re-evaluation; see setTick

  // Throttle countdown: while blocked, re-evaluate the throttle every second so
  // the remaining time visibly counts down and the inputs re-enable the moment
  // the cooldown expires. Without this the blocked UI freezes (inputs are
  // disabled and nothing else triggers a re-render) and the gate looks stuck
  // until a full page reload.
  useEffect(() => {
    if (!state.blocked) return
    const id = window.setInterval(() => setTick((n) => n + 1), 1_000)
    return () => window.clearInterval(id)
  }, [state.blocked])

  const refresh = (): void => {
    const wasUnlocked =
      serviceRef.current !== null && !serviceRef.current.getState().locked
    if (serviceRef.current) {
      const sub = serviceRef.current.subscribe(() => setTick((n) => n + 1))
      sub()
    }
    serviceRef.current = buildService(wasUnlocked)
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

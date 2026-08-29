/**
 * Failed-attempt throttling policy (docs/PROJECT_SPEC.md §6.2):
 * 5 consecutive failures → 30 s cooldown, doubling per extra failure,
 * capped at 5 minutes. Confirmed reference behavior; no other backoff.
 *
 * The counter is in-memory only — the reference keeps it in its (non-persisted)
 * security store, so it does not survive an app restart. Do not add persistence.
 */

/** Consecutive wrong attempts allowed before a cooldown starts. */
export const FAILURES_BEFORE_LOCKOUT = 5
/** First cooldown duration; doubles per extra failure (capped). */
export const FIRST_LOCKOUT_MS = 30_000
/** Maximum cooldown duration (5 minutes). */
export const MAX_LOCKOUT_MS = 300_000

/** Cooldown for the nth consecutive failure, or null while under the threshold. */
export function lockoutMsFor(attempt: number): number | null {
  if (attempt < FAILURES_BEFORE_LOCKOUT) return null
  const exp = attempt - FAILURES_BEFORE_LOCKOUT
  return Math.min(FIRST_LOCKOUT_MS * 2 ** exp, MAX_LOCKOUT_MS)
}

/** Immutable view of the throttle state for later UI/gate code. */
export interface ThrottleState {
  /** Consecutive failed attempts since the last success/reset. */
  failures: number
  /** Epoch ms until which attempts are rejected; null when not blocked. */
  lockedUntil: number | null
}

export interface AttemptThrottle {
  /** Record one failed attempt; arms the cooldown when the threshold is hit. */
  recordFailure(now?: number): ThrottleState
  /** Clear the failure counter and any active cooldown (after a success). */
  reset(): void
  /** True while attempts are rejected. */
  isBlocked(now?: number): boolean
  /** Ms remaining in the cooldown; 0 when not blocked. */
  remainingMs(now?: number): number
  /** Current immutable state. */
  snapshot(): ThrottleState
}

/** In-memory attempt throttle. Create one per lock session (gate/store layer). */
export function createAttemptThrottle(): AttemptThrottle {
  let failures = 0
  let lockedUntil: number | null = null

  return {
    recordFailure(now = Date.now()): ThrottleState {
      failures += 1
      const duration = lockoutMsFor(failures)
      lockedUntil = duration === null ? null : now + duration
      return { failures, lockedUntil }
    },
    reset(): void {
      failures = 0
      lockedUntil = null
    },
    isBlocked(now = Date.now()): boolean {
      return lockedUntil !== null && now < lockedUntil
    },
    remainingMs(now = Date.now()): number {
      return lockedUntil !== null && now < lockedUntil ? lockedUntil - now : 0
    },
    snapshot(): ThrottleState {
      return { failures, lockedUntil }
    },
  }
}


// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  FAILURES_BEFORE_LOCKOUT,
  FIRST_LOCKOUT_MS,
  MAX_LOCKOUT_MS,
  createAttemptThrottle,
  lockoutMsFor,
} from './throttle'

describe('failed-attempt throttling (§6.2: 5 → 30 s, doubling, 5-min cap)', () => {
  it('does not lock out before 5 consecutive failures', () => {
    expect(lockoutMsFor(1)).toBeNull()
    expect(lockoutMsFor(4)).toBeNull()
  })

  it('locks out 30 s on the 5th failure and doubles per extra failure', () => {
    expect(lockoutMsFor(5)).toBe(FIRST_LOCKOUT_MS) // 30_000
    expect(lockoutMsFor(6)).toBe(60_000)
    expect(lockoutMsFor(7)).toBe(120_000)
    expect(lockoutMsFor(8)).toBe(240_000)
  })

  it('caps the cooldown at 5 minutes', () => {
    expect(lockoutMsFor(9)).toBe(MAX_LOCKOUT_MS) // 480_000 → 300_000
    expect(lockoutMsFor(10)).toBe(MAX_LOCKOUT_MS)
    expect(lockoutMsFor(100)).toBe(MAX_LOCKOUT_MS)
  })

  it('tracks blocked state and remaining time deterministically', () => {
    const throttle = createAttemptThrottle()
    let t = 1_000
    const now = () => t
    for (let i = 0; i < FAILURES_BEFORE_LOCKOUT; i += 1) throttle.recordFailure(now())
    expect(throttle.isBlocked(now())).toBe(true)
    expect(throttle.remainingMs(now())).toBe(FIRST_LOCKOUT_MS)
    expect(throttle.snapshot()).toEqual({ failures: 5, lockedUntil: t + FIRST_LOCKOUT_MS })

    t += FIRST_LOCKOUT_MS - 1
    expect(throttle.isBlocked(now())).toBe(true)
    expect(throttle.remainingMs(now())).toBe(1)

    t += 1
    expect(throttle.isBlocked(now())).toBe(false)
    expect(throttle.remainingMs(now())).toBe(0)
  })

  it('doubles the cooldown on the failure right after a lockout', () => {
    const throttle = createAttemptThrottle()
    let t = 0
    const now = () => t
    for (let i = 0; i < 6; i += 1) throttle.recordFailure(now())
    expect(throttle.remainingMs(now())).toBe(60_000) // doubled after the 6th failure
    t += 59_999
    expect(throttle.isBlocked(now())).toBe(true)
    t += 1
    expect(throttle.isBlocked(now())).toBe(false)
  })

  it('resets on success', () => {
    const throttle = createAttemptThrottle()
    for (let i = 0; i < 6; i += 1) throttle.recordFailure()
    throttle.reset()
    expect(throttle.isBlocked()).toBe(false)
    expect(throttle.snapshot()).toEqual({ failures: 0, lockedUntil: null })
  })
})

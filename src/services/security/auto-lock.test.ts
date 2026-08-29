import { describe, expect, it } from 'vitest'
import { AUTO_LOCK_TIMEOUTS, autoLockTimeoutMs, parseAutoLockTimeout } from './auto-lock'

describe('auto-lock policy (§6.2: immediately / 60 / 300 / 900 + Lock Now)', () => {
  it('exposes exactly the documented options in display order', () => {
    expect(AUTO_LOCK_TIMEOUTS).toEqual(['immediately', '60', '300', '900'])
  })

  it('maps timeouts to milliseconds (0 = lock on any background)', () => {
    expect(autoLockTimeoutMs('immediately')).toBe(0)
    expect(autoLockTimeoutMs('60')).toBe(60_000)
    expect(autoLockTimeoutMs('300')).toBe(300_000)
    expect(autoLockTimeoutMs('900')).toBe(900_000)
  })

  it('falls back to immediately for unknown/missing stored values', () => {
    expect(parseAutoLockTimeout('600')).toBe('immediately')
    expect(parseAutoLockTimeout('')).toBe('immediately')
    expect(parseAutoLockTimeout(null)).toBe('immediately')
    expect(parseAutoLockTimeout(undefined)).toBe('immediately')
    expect(parseAutoLockTimeout('300')).toBe('300')
  })
})

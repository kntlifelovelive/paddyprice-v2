import { describe, expect, it } from 'vitest'
import { SECURITY_GATE_ORDER } from './gates'
import {
  DEVICE_AUTH_CHECK_FAILED,
  SECURITY_LOCK_TITLE,
  WAITING_FOR_ACTIVATION,
} from './messages'

describe('security presentation contracts (English-only, §6.5–§6.7)', () => {
  it('preserves the documented gate order: device authorization → app lock → app', () => {
    expect([...SECURITY_GATE_ORDER]).toEqual(['device-authorization', 'app-lock', 'application'])
  })

  it('the lock title is exactly `Security Lock` — never translated', () => {
    expect(SECURITY_LOCK_TITLE).toBe('Security Lock')
  })

  it('security-critical device-gate text is English regardless of app language', () => {
    expect(WAITING_FOR_ACTIVATION).toBe('Waiting for activation…')
    expect(DEVICE_AUTH_CHECK_FAILED).toBe('Device authorization check failed')
  })
})

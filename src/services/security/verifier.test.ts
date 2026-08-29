// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ITERATIONS,
  constantTimeEqual,
  createVerifier,
  isValidPattern,
  isValidPin,
  patternToSecret,
  verifySecret,
} from './verifier'

describe('PBKDF2 verifier (App Lock secrets)', () => {
  it('creates verifiers in the documented format with 100,000 iterations', async () => {
    const verifier = await createVerifier('1234')
    const parts = verifier.split('$')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('pbkdf2-sha256')
    expect(Number(parts[1])).toBe(DEFAULT_ITERATIONS) // 100_000 — documented value
    expect(parts[2]).toMatch(/^[A-Za-z0-9+/=]+$/) // 16-byte salt, base64
    expect(parts[3]).toMatch(/^[A-Za-z0-9+/=]+$/) // 256-bit hash, base64
  })

  it('verifies the correct secret and rejects wrong ones', async () => {
    const verifier = await createVerifier('9513')
    expect(await verifySecret('9513', verifier)).toBe(true)
    expect(await verifySecret('9514', verifier)).toBe(false)
    expect(await verifySecret('', verifier)).toBe(false)
    expect(await verifySecret('9513', null)).toBe(false)
    expect(await verifySecret('9513', '')).toBe(false)
  })

  it('fails closed on malformed verifiers', async () => {
    const verifier = await createVerifier('abcd')
    expect(await verifySecret('abcd', 'not-a-verifier')).toBe(false)
    expect(await verifySecret('abcd', 'md5$1000$aa$bb')).toBe(false)
    expect(await verifySecret('abcd', 'pbkdf2-sha256$0$!!$??')).toBe(false)
    expect(await verifySecret('abcd', verifier.slice(0, -4))).toBe(false)
  })

  it('salts every verifier uniquely (same secret → different verifiers)', async () => {
    const a = await createVerifier('same-secret')
    const b = await createVerifier('same-secret')
    expect(a).not.toBe(b)
    expect(await verifySecret('same-secret', a)).toBe(true)
    expect(await verifySecret('same-secret', b)).toBe(true)
  })
})

describe('credential validation (§6.2 — no invented rules)', () => {
  it('accepts patterns with >= 4 unique dots in 0..8', () => {
    expect(isValidPattern([0, 1, 2, 3])).toBe(true)
    expect(isValidPattern([8, 7, 6, 5, 4])).toBe(true)
    expect(isValidPattern([0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(true)
  })

  it('rejects short, repeated, or out-of-range patterns', () => {
    expect(isValidPattern([0, 1, 2])).toBe(false) // < 4 dots
    expect(isValidPattern([])).toBe(false)
    expect(isValidPattern([0, 1, 1, 2])).toBe(false) // repeated dot
    expect(isValidPattern([0, 1, 2, 9])).toBe(false) // out of range
    expect(isValidPattern([0, 1, 2, 1.5])).toBe(false)
  })

  it('accepts only 4-8 digit PINs (no arbitrary passwords)', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('12345678')).toBe(true)
    expect(isValidPin('0000')).toBe(true)
    expect(isValidPin('123')).toBe(false) // too short
    expect(isValidPin('123456789')).toBe(false) // too long
    expect(isValidPin('12a4')).toBe(false) // not digits
    expect(isValidPin('')).toBe(false)
    expect(isValidPin('12 4')).toBe(false)
  })

  it('canonicalizes patterns with draw order significant', () => {
    expect(patternToSecret([0, 1, 2, 4])).toBe('0-1-2-4')
    expect(patternToSecret([4, 2, 1, 0])).not.toBe(patternToSecret([0, 1, 2, 4]))
  })

  it('compares byte arrays in constant time', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true)
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false)
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false)
  })
})

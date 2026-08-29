/**
 * PBKDF2-SHA256 verifier primitives for App Lock (docs/PROJECT_SPEC.md §6.4).
 *
 * Secrets (PIN / pattern) are NEVER stored. A salted verifier is created:
 *
 *   pbkdf2-sha256$<iterations>$<saltBase64>$<hashBase64>
 *
 * (format confirmed by docs/REFERENCE_NOTES.md §12.2). Verification re-derives
 * the hash from the presented secret using the stored salt + iteration count
 * and compares in constant time. Raw secrets exist only transiently in memory.
 * Ported behavior-identically from the reference project's confirmed
 * primitives — no alternative algorithm is used.
 */

/** PBKDF2 iterations — confirmed reference value. */
export const DEFAULT_ITERATIONS = 100_000

/** §6.2 — minimum number of pattern dots required. */
export const MIN_PATTERN_LENGTH = 4
/** §6.2 — PIN length bounds. */
export const MIN_PIN_LENGTH = 4
export const MAX_PIN_LENGTH = 8

const VERIFIER_PREFIX = 'pbkdf2-sha256'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle
  if (!s) throw new Error('Web Crypto API is not available')
  return s
}

/** Constant-time equality of two byte arrays. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Derive a 256-bit key from the secret with PBKDF2-SHA256. */
async function derive(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const keyMaterial = await subtle().importKey('raw', enc.encode(secret), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
}

/** Create a storable verifier string for a raw secret. */
export async function createVerifier(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(secret, salt, DEFAULT_ITERATIONS)
  return `${VERIFIER_PREFIX}$${DEFAULT_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`
}

/**
 * Verify a raw secret against a stored verifier.
 * Returns false on malformed verifiers instead of throwing (fail closed).
 */
export async function verifySecret(
  secret: string,
  verifier: string | null | undefined,
): Promise<boolean> {
  if (!secret || !verifier) return false
  const parts = verifier.split('$')
  if (parts.length !== 4 || parts[0] !== VERIFIER_PREFIX) return false
  const iterations = Number(parts[1])
  if (!Number.isFinite(iterations) || iterations < 1) return false

  try {
    const salt = base64ToBytes(parts[2])
    const expected = base64ToBytes(parts[3])
    const actual = await derive(secret, salt, iterations)
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}

/**
 * Normalize a pattern (list of selected dot indices 0..8 in draw order) into
 * the canonical secret string used for hashing (confirmed reference rule:
 * draw order is significant).
 */
export function patternToSecret(points: number[]): string {
  return points.join('-')
}

/** §6.2 — at least 4 unique dots, indices 0–8, no other rules. */
export function isValidPattern(points: number[]): boolean {
  return (
    points.length >= MIN_PATTERN_LENGTH &&
    points.every((p) => Number.isInteger(p) && p >= 0 && p <= 8) &&
    new Set(points).size === points.length
  )
}

/** §6.2 — 4–8 digits; arbitrary passwords are not accepted. */
export function isValidPin(pin: string): boolean {
  return pin.length >= MIN_PIN_LENGTH && pin.length <= MAX_PIN_LENGTH && /^\d+$/.test(pin)
}

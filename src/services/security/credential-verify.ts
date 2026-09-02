/**
 * Credential verification for destructive-action protection (e.g. the
 * customer delete-lock on the Customer page and the purchase delete-lock on
 * the History page).
 *
 * This is a thin REUSE wrapper only: it reads the EXISTING App Lock
 * credential verifiers (settings keys `security.pattern` / `security.pin`)
 * and verifies against them with the EXISTING PBKDF2 verifier primitives.
 * No second PIN/pattern storage, no App Lock architecture change, no new
 * persistence.
 */
import type { Database } from 'sql.js'
import { getSetting } from '@/infrastructure/db/dao/settings'
import { SECURITY_KEY_PATTERN, SECURITY_KEY_PIN } from './app-lock'
import { isValidPattern, patternToSecret, verifySecret } from './verifier'

/** Which App Lock credentials are configured (presence flags only — no secrets). */
export interface CredentialAvailability {
  hasPattern: boolean
  hasPin: boolean
}

/** A credential attempt captured by the shared unlock dialog. */
export type CredentialAttempt =
  | { kind: 'pattern'; points: number[] }
  | { kind: 'pin'; value: string }

export function readCredentialAvailability(db: Database): CredentialAvailability {
  return {
    hasPattern: getSetting(db, SECURITY_KEY_PATTERN) !== null,
    hasPin: getSetting(db, SECURITY_KEY_PIN) !== null,
  }
}

/** Verify a captured attempt against the EXISTING App Lock verifier. Fails closed. */
export async function verifyAppLockCredential(
  db: Database,
  attempt: CredentialAttempt,
): Promise<boolean> {
  if (attempt.kind === 'pattern') {
    if (!isValidPattern(attempt.points)) return false
    const verifier = getSetting(db, SECURITY_KEY_PATTERN)
    return verifySecret(patternToSecret(attempt.points), verifier)
  }
  const verifier = getSetting(db, SECURITY_KEY_PIN)
  return verifySecret(attempt.value, verifier)
}

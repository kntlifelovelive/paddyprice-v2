/**
 * Auto-lock timeout policy (docs/PROJECT_SPEC.md §6.2 / §6.7).
 * Options and ms mapping confirmed from the reference implementation.
 */
import type { AutoLockTimeout } from '@/types'

/** The documented option list, in display order. */
export const AUTO_LOCK_TIMEOUTS: readonly AutoLockTimeout[] = [
  'immediately',
  '60',
  '300',
  '900',
]

/** Ms after backgrounding at which the app re-locks (0 = on any background). */
export function autoLockTimeoutMs(timeout: AutoLockTimeout): number {
  switch (timeout) {
    case '60':
      return 60_000
    case '300':
      return 300_000
    case '900':
      return 900_000
    case 'immediately':
      return 0
  }
}

/** Parse a stored timeout value; unknown/missing values fall back to `'immediately'`. */
export function parseAutoLockTimeout(value: string | null | undefined): AutoLockTimeout {
  const normalized = value ?? ''
  return (AUTO_LOCK_TIMEOUTS as readonly string[]).includes(normalized)
    ? (normalized as AutoLockTimeout)
    : 'immediately'
}

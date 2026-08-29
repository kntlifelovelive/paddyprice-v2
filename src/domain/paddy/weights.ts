/**
 * Weight input validation — docs/DOMAIN_RULES.md §2.
 *
 * This is the only validation that affects calculations: invalid input is
 * rejected and never stored. Pure functions only — no I/O, no platform, no UI.
 */

export type WeightValidationErrorReason = 'empty' | 'not-a-number' | 'negative' | 'zero';

export type WeightValidationResult =
  | { ok: true; value: number }
  | { ok: false; reason: WeightValidationErrorReason };

/**
 * §2.2 — validate one bag weight input (pounds).
 * - Input is trimmed; empty after trim → 'empty'.
 * - Not a finite number after `Number(raw)` → 'not-a-number'.
 * - Negative (< 0) → 'negative'.
 * - Zero (=== 0) → 'zero'.
 * - Otherwise valid; the stored value is the parsed number.
 *
 * Note: duplicate weights are allowed (§2.3) — there is deliberately no
 * duplicate check here.
 */
export function validateWeight(raw: string): WeightValidationResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, reason: 'not-a-number' };
  if (value < 0) return { ok: false, reason: 'negative' };
  if (value === 0) return { ok: false, reason: 'zero' };

  return { ok: true, value };
}

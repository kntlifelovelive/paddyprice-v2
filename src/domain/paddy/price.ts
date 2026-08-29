/**
 * Myanmar rice-market price rules — docs/DOMAIN_RULES.md §5.
 *
 * The user enters the price for 100 tins in the shorthand `A/B`:
 *
 *   18/50000  =>  100 tins = 1,850,000 MMK  =>  1 tin = 18,500 MMK
 *
 * This is NOT a mathematical fraction. Pure functions only.
 */

/** §5.1 — a parsed rice price. */
export interface ParsedPrice {
  /** MMK for 100 tins. */
  price_100_tin: number;
  /** MMK for 1 tin (price_100_tin / 100). */
  price_per_tin: number;
}

/** §5.1 — matches `18/50000`, `18/0`, `18/99999`, etc. (A: 1–3 digits, B: 1–5 digits). */
const PRICE_FORMAT_RE = /^(\d{1,3})\/(\d{1,5})$/;

/**
 * §5.1 — parse a Myanmar rice price string like "18/50000".
 * - Input is trimmed.
 * - Must match A/B (A = 1–3 digits, B = 1–5 digits).
 * - Both parts must be finite; `price_100_tin = A × 100_000 + B`.
 * - `price_100_tin` must be > 0 (e.g. "0/0" is rejected).
 * Returns null when invalid.
 */
export function parsePriceFormat(input: string): ParsedPrice | null {
  const trimmed = input.trim();
  const match = PRICE_FORMAT_RE.exec(trimmed);
  if (!match) return null;

  const a = Number(match[1]);
  const b = Number(match[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  const price_100_tin = a * 100_000 + b;
  if (price_100_tin <= 0) return null;

  return {
    price_100_tin,
    price_per_tin: price_100_tin / 100,
  };
}

/**
 * §5.1 — format a numeric 100-tin price back into the shorthand style:
 * `A = floor(price / 100_000)`, `B = price % 100_000`, formatted `A/BBBBB`
 * (B zero-padded to 5 digits). Non-integer / non-positive values are
 * formatted as a plain number.
 */
export function formatPriceShorthand(price100Tin: number): string {
  if (!Number.isInteger(price100Tin) || price100Tin <= 0) {
    return String(price100Tin);
  }
  const a = Math.floor(price100Tin / 100_000);
  const b = price100Tin % 100_000;
  return `${a}/${String(b).padStart(5, '0')}`;
}
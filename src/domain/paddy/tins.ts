/**
 * Tin / pound conversion — docs/DOMAIN_RULES.md §1 and §3.
 *
 * Formulas never round; rounding happens at presentation/export time only
 * (see `shared/format` later). Pure functions only.
 */

/** §1 — default tin size: 1 tin = 50 lb. */
export const DEFAULT_LB_PER_TIN = 50;

/**
 * §3 — `pounds_to_tins(pounds, lb_per_tin) = pounds / lb_per_tin` (no
 * rounding). e.g. 99.8 lb @ 50 → 1.996 tins; 1 lb @ 50 → 0.02 tins (not
 * rounded to 0).
 */
export function poundsToTins(pounds: number, lbPerTin: number = DEFAULT_LB_PER_TIN): number {
  return pounds / lbPerTin;
}

/**
 * §1 — the effective lb_per_tin is the stored tin_formula value, falling back
 * to 50 when it is missing or invalid. Any finite value > 0 may be stored.
 */
export function resolveLbPerTin(raw: string | number | null | undefined): number {
  const value = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_LB_PER_TIN;
}

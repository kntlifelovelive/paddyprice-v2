/**
 * §4 — Net-pound → Tin + Extra Lb decomposition (pure domain).
 *
 * Normal purchase displays present a net pound result as a whole-tin count
 * plus the remaining pounds ("148 lb → 2 Tin + 48 Extra Lb"). Extra Lb is the
 * remainder of the NET pound after the tin conversion — it is never a moisture
 * deduction value and never recomputed from gross pound (PROJECT_SPEC §4/§10).
 *
 * No intermediate rounding: `tins` is the whole-tin floor of the exact tin
 * value; `extraLb` is the exact remainder.
 */
import { poundsToTins } from './tins';

/** Net-pound tin/extra decomposition. */
export interface TinBreakdown {
  /** Whole tins contained in the net pound (floor of the exact tin value). */
  tins: number;
  /** Remaining pounds after removing the whole tins (`netLb - tins * lbPerTin`). */
  extraLb: number;
}

/**
 * Decompose a net pound result into whole tins + extra pounds.
 * Non-finite or non-positive net pound yields `{ tins: 0, extraLb: 0 }`.
 */
export function decomposeNetPound(netLb: number, lbPerTin: number): TinBreakdown {
  if (!Number.isFinite(netLb) || netLb <= 0 || !Number.isFinite(lbPerTin) || lbPerTin <= 0) {
    return { tins: 0, extraLb: 0 };
  }
  const exactTins = poundsToTins(netLb, lbPerTin);
  const tins = Math.floor(exactTins);
  const extraLb = netLb - tins * lbPerTin;
  return { tins, extraLb };
}

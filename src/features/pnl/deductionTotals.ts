/**
 * P&L Moisture Deduction table — Total footer aggregation (§8.1).
 *
 * Aggregates the EXISTING P2 row-level deduction results that the table
 * already displays — no new formulas:
 *
 *   - Total Deduction Pound = Σ the displayed rows' deduction pounds (the
 *     P&L page filters the entries the table displays — moisture-cleared
 *     entries are excluded — and passes Σ those displayed rows' deduction
 *     pounds, matching the domain report's per-entry §8.1 results).
 *   - Total Tin / Extra Lb = the TOTAL deduction pound decomposed ONCE with
 *     the existing P2 rule (`decomposeDeductionPound`): total pound ÷ tin
 *     size → whole tins + remaining pounds. This matches the row columns'
 *     meaning applied to the total pound (e.g. 98.75 + 98.75 = 197.5 lb →
 *     3 Tin + 47.5 Extra lb — NOT 2 Tin + 97.5 Extra, which would leave more
 *     than a whole tin inside "Extra").
 *   - Total Amount = Σ the existing row-level `computeDeductionAmount` for
 *     every entry whose purchase row exists (each row valued at its OWN
 *     stored snapshot price — never one global price, never purchase amounts).
 */
import { decomposeDeductionPound } from '@/domain/paddy/tinBreakdown'
import { computeDeductionAmount } from '@/domain/pnl/report'
import type { PurchaseDeductionEntry } from '@/services/reports'

/** Aggregated Total footer values for the Moisture Deduction table. */
export interface DeductionTotals {
  /** Total deduction pound (lb) — Σ the displayed rows' deduction pounds. */
  deductionLb: number
  /** Whole tins contained in the TOTAL deduction pound (existing P2 rule). */
  tins: number
  /** Remaining pounds of the TOTAL deduction pound after the whole tins. */
  extraLb: number
  /** Σ of each displayed row's deduction amount at that row's stored price. */
  amount: number
}

/**
 * Aggregate the given deduction entries (the exact rows displayed by the
 * Moisture Deduction table) into the Total footer values.
 *
 * `totalDeductionLb` is Σ those same displayed rows' deduction pounds (§8.1);
 * Tin + Extra Lb decompose it once with the existing P2 rule.
 *
 * `priceFor` returns the stored snapshot `price_per_tin` for a purchase_no, or
 * undefined when no matching purchase row exists (such entries contribute to
 * pound/tin/extra but not to amount — matching the original row rendering).
 */
export function computeDeductionTotals(
  totalDeductionLb: number | undefined,
  entries: readonly PurchaseDeductionEntry[],
  priceFor: (purchaseNo: string) => number | undefined,
  lbPerTin: number,
): DeductionTotals {
  const deductionLb = totalDeductionLb ?? 0
  const { tins, extraLb } = decomposeDeductionPound(deductionLb, lbPerTin)
  let amount = 0
  for (const entry of entries) {
    const price = priceFor(entry.purchase_no)
    if (price !== undefined) {
      amount += computeDeductionAmount(entry.breakdown.total_deduction_lb, price, lbPerTin)
    }
  }
  return { deductionLb, tins, extraLb, amount }
}


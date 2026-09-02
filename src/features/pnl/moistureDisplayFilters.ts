/**
 * P&L moisture-table display filtering (§8 / §8.1).
 *
 * The P&L page's two moisture tables show a SUBSET of the saved purchases.
 * These filters read the EXISTING domain moisture results as the source of
 * truth — no new eligibility rule is introduced here:
 *
 *   - Moisture table: a row qualifies when the stored data carries a valid
 *     moisture result — Pattern 1 (the purchase's `moisture_label` is set)
 *     or Pattern 2 (at least one bag row carries a label, which the domain's
 *     `formatMoistureLabelCount` reports as a non-empty `moisture_breakdown`).
 *   - Moisture Deduction table: an entry qualifies only when it actually has
 *     a moisture deduction — the domain breakdown's total deduction pound is
 *     > 0. A moisture-cleared purchase (no deduction) never appears.
 *
 * Pure predicates over domain results — no I/O, no formulas, no re-derivation.
 */
import type { PnlRow } from '@/domain/pnl/report'
import type { PurchaseDeductionEntry } from '@/services/reports'

/** §8 — a P&L row with a valid Pattern 1 / Pattern 2 moisture result. */
export function hasMoistureResult(row: PnlRow): boolean {
  return row.moisture_label != null || row.moisture_breakdown !== ''
}

/** §8.1 — a deduction entry with an ACTUAL deduction (moisture-cleared ⇒ excluded). */
export function hasMoistureDeduction(entry: PurchaseDeductionEntry): boolean {
  return entry.breakdown.total_deduction_lb > 0
}

/** Σ the deduction pounds of the entries the Moisture Deduction table displays. */
export function sumDeductionLb(entries: readonly PurchaseDeductionEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.breakdown.total_deduction_lb, 0)
}

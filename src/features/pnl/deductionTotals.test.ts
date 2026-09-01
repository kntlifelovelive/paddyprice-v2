import { describe, expect, it } from 'vitest'

import { decomposeDeductionPound } from '@/domain/paddy/tinBreakdown'
import { computeDeductionAmount } from '@/domain/pnl/report'
import type { PurchaseDeductionEntry } from '@/services/reports'

import { computeDeductionTotals } from './deductionTotals'

/**
 * Regression tests for the P&L Moisture Deduction table's Total footer (§8.1).
 *
 * Confirmed intended behavior: the Total aggregates the SAME row-level P2
 * deduction results the table displays — Total Pound = Σ row deduction
 * pounds; Total Tin + Extra Lb decompose that TOTAL pound ONCE with the
 * existing P2 rule (`decomposeDeductionPound`); Total Amount = Σ the existing
 * row-level `computeDeductionAmount` at each row's OWN stored price.
 * Expectations below are derived from those existing P2 functions — no
 * tin-conversion value is re-invented here.
 */

const LB_PER_TIN = 50

function entry(
  purchase_no: string,
  total_deduction_lb: number,
): PurchaseDeductionEntry {
  return {
    purchase_no,
    date: '2026-09-01',
    farmer_name: `Farmer ${purchase_no}`,
    rice_type_name: 'Emata',
    breakdown: { labels: [], total_deduction_lb },
  }
}

describe('computeDeductionTotals (P&L §8.1 — Moisture Deduction Total row)', () => {
  it('aggregates multiple rows: pound sums, tin/extra decompose the total once, amount sums row amounts', () => {
    // Two rows with DIFFERENT stored prices (per-row amount valuation).
    const entries = [
      entry('PSO-202609-0001', 98.75), // price 40_000
      entry('PSO-202609-0002', 100), // price 18_500
    ]
    const prices = new Map([
      ['PSO-202609-0001', 40_000],
      ['PSO-202609-0002', 18_500],
    ])

    // Report total = Σ the same displayed rows (services/reports contract).
    const reportTotal = 98.75 + 100

    const totals = computeDeductionTotals(
      reportTotal,
      entries,
      (no) => prices.get(no),
      LB_PER_TIN,
    )

    // Total Pound = Σ row deduction pounds (the report total over those rows).
    expect(totals.deductionLb).toBe(reportTotal)

    // Total Tin / Extra Lb = the TOTAL pound decomposed ONCE (198.75 lb at
    // 50 lb/tin → 3 Tin + 48.75 Extra lb).
    expect(totals.tins).toBe(decomposeDeductionPound(reportTotal, LB_PER_TIN).tins)
    expect(totals.extraLb).toBeCloseTo(
      decomposeDeductionPound(reportTotal, LB_PER_TIN).extraLb,
      6,
    )

    // Total Amount = Σ of each row's existing deduction amount (own price).
    expect(totals.amount).toBeCloseTo(
      computeDeductionAmount(98.75, 40_000, LB_PER_TIN) +
        computeDeductionAmount(100, 18_500, LB_PER_TIN),
      6,
    )
  })

  it('decomposes the GRAND TOTAL once — not a sum of per-row decompositions', () => {
    // 98.75 lb twice → 197.5 lb total → 3 Tin + 47.5 Extra lb.
    // Summing each row's own decomposition (1 Tin + 48.75 lb each) would give
    // 2 Tin + 97.5 Extra — leaving more than a whole tin inside "Extra". The
    // Total applies the row columns' meaning to the total pound instead.
    const entries = [entry('PSO-202609-0001', 98.75), entry('PSO-202609-0002', 98.75)]
    const totals = computeDeductionTotals(
      98.75 + 98.75,
      entries,
      () => 40_000,
      LB_PER_TIN,
    )

    const grandTotalParts = decomposeDeductionPound(197.5, LB_PER_TIN)
    expect(totals.tins).toBe(grandTotalParts.tins) // 3
    expect(totals.extraLb).toBeCloseTo(grandTotalParts.extraLb, 6) // 47.5

    // Guard the regression explicitly against the per-row-sum alternative.
    const rowParts = decomposeDeductionPound(98.75, LB_PER_TIN)
    expect(rowParts.tins * 2).not.toBe(totals.tins)
    expect(rowParts.extraLb * 2).not.toBeCloseTo(totals.extraLb, 6)
  })

  it('values each row at its OWN stored price — never one global price', () => {
    const entries = [entry('PSO-202609-0001', 100), entry('PSO-202609-0002', 100)]
    const prices = new Map([
      ['PSO-202609-0001', 40_000],
      ['PSO-202609-0002', 18_500],
    ])
    const totals = computeDeductionTotals(
      200,
      entries,
      (no) => prices.get(no),
      LB_PER_TIN,
    )
    expect(totals.amount).toBeCloseTo(
      computeDeductionAmount(100, 40_000, LB_PER_TIN) +
        computeDeductionAmount(100, 18_500, LB_PER_TIN),
      6,
    )
  })

  it('excludes entries with no matching purchase row from Amount only', () => {
    const entries = [entry('PSO-202609-0001', 98.75), entry('PSO-202609-9999', 50)]
    // Only the first purchase has a P&L row (its stored price).
    const totals = computeDeductionTotals(
      148.75,
      entries,
      (no) => (no === 'PSO-202609-0001' ? 40_000 : undefined),
      LB_PER_TIN,
    )
    expect(totals.deductionLb).toBe(148.75)
    // Tin/Extra come from the total pound (148.75 lb → 2 Tin + 48.75 Extra).
    expect(totals.tins).toBe(decomposeDeductionPound(148.75, LB_PER_TIN).tins)
    expect(totals.extraLb).toBeCloseTo(
      decomposeDeductionPound(148.75, LB_PER_TIN).extraLb,
      6,
    )
    expect(totals.amount).toBeCloseTo(
      computeDeductionAmount(98.75, 40_000, LB_PER_TIN),
      6,
    )
  })

  it('yields all zeros for no entries / no report', () => {
    expect(computeDeductionTotals(undefined, [], () => undefined, LB_PER_TIN)).toEqual({
      deductionLb: 0,
      tins: 0,
      extraLb: 0,
      amount: 0,
    })
  })
})

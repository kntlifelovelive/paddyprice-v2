import { describe, expect, it } from 'vitest'

import type { MoistureRates } from '@/domain/paddy/moisture'
import { computeMoistureTotals } from '@/domain/paddy/moisture'
import type { BagRow } from '@/domain/purchase/totals'
import { computeMoistureDeductionBreakdown } from './report'

const DEFAULT_RATES: MoistureRates = { 17: 1, 18: 2, 19: 3, 20: 4 }

describe('computeMoistureDeductionBreakdown (§8.1)', () => {
  it('returns empty labels + zero total for no rows', () => {
    const b = computeMoistureDeductionBreakdown([], DEFAULT_RATES)
    expect(b.labels).toEqual([])
    expect(b.total_deduction_lb).toBe(0)
  })

  it('aggregates deduction pounds per label from bag rows (ascending, no net pound)', () => {
    const rows: BagRow[] = [
      { weight_lb: 50, moisture_label: 17 }, // 1 lb
      { weight_lb: 100, moisture_label: 18 }, // 4 lb
      { weight_lb: 50, moisture_label: 19 }, // 3 lb
      { weight_lb: 25, moisture_label: null }, // None → 0
    ]
    const b = computeMoistureDeductionBreakdown(rows, DEFAULT_RATES)
    expect(b.labels).toEqual([
      { label: 17, deduction_lb: 1 },
      { label: 18, deduction_lb: 4 },
      { label: 19, deduction_lb: 3 },
    ])
    // Only labels with deduction data appear.
    expect(b.labels.map((l) => l.label)).not.toContain(20)
    expect(b.total_deduction_lb).toBe(8)
  })

  it('total equals the purchase moisture loss from the same rows/rates', () => {
    const rows: BagRow[] = [
      { weight_lb: 50, moisture_label: 17 },
      { weight_lb: 100, moisture_label: 18 },
      { weight_lb: 50, moisture_label: 19 },
      { weight_lb: 25, moisture_label: null },
    ]
    const deduction = computeMoistureDeductionBreakdown(rows, DEFAULT_RATES)
    const totals = computeMoistureTotals(rows, DEFAULT_RATES)
    expect(deduction.total_deduction_lb).toBe(totals.moisture_loss)
    expect(deduction.total_deduction_lb).not.toBe(totals.net_pound)
    // netPound = grossPound − deductionTotal (independent relationship)
    expect(totals.gross_pound - deduction.total_deduction_lb).toBe(totals.net_pound)
  })

  it('uses the snapshotted rates (custom rates, not current settings)', () => {
    const custom: MoistureRates = { 17: 5, 18: 2, 19: 3, 20: 4 }
    const b = computeMoistureDeductionBreakdown([{ weight_lb: 100, moisture_label: 17 }], custom)
    expect(b.labels).toEqual([{ label: 17, deduction_lb: 10 }])
    expect(b.total_deduction_lb).toBe(10)
  })
})
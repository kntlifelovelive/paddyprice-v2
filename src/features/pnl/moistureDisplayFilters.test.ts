import { describe, expect, it } from 'vitest'

import type { PnlRow } from '@/domain/pnl/report'
import type { PurchaseDeductionEntry } from '@/services/reports'

import { hasMoistureDeduction, hasMoistureResult, sumDeductionLb } from './moistureDisplayFilters'

/**
 * Tests for the P&L page's moisture-table display filters (§8 / §8.1).
 *
 * The filters read the EXISTING domain moisture results only:
 *  - a Moisture table row qualifies with a Pattern 1 label OR a non-empty
 *    Pattern 2 breakdown (`formatMoistureLabelCount` result);
 *  - a Moisture Deduction entry qualifies only with an ACTUAL deduction
 *    (total_deduction_lb > 0) — a moisture-cleared purchase never appears.
 */

function pnlRow(overrides: Partial<PnlRow>): PnlRow {
  return {
    purchase_no: 'PSO-202609-0001',
    date: '2026-09-01',
    farmer_name: 'Ko Aung',
    rice_type_name: 'Emata',
    gross_pound: 500,
    moisture_label: null,
    moisture_loss: 0,
    net_pound: 500,
    price_per_tin: 40_000,
    total_amount: 400_000,
    moisture_breakdown: '',
    ...overrides,
  }
}

function entry(total_deduction_lb: number): PurchaseDeductionEntry {
  return {
    purchase_no: 'PSO-202609-0001',
    date: '2026-09-01',
    farmer_name: 'Ko Aung',
    rice_type_name: 'Emata',
    breakdown: { labels: [], total_deduction_lb },
  }
}

describe('hasMoistureResult (P&L Moisture table filter, §8)', () => {
  it('accepts a Pattern 1 row (purchase-level label set)', () => {
    expect(hasMoistureResult(pnlRow({ moisture_label: 18, moisture_breakdown: '' }))).toBe(true)
  })

  it('accepts a Pattern 2 row (labeled bag rows, purchase label None)', () => {
    expect(hasMoistureResult(pnlRow({ moisture_label: null, moisture_breakdown: '17:2, 18:1' }))).toBe(true)
  })

  it('rejects a moisture-cleared row (no label, no labeled bags)', () => {
    expect(hasMoistureResult(pnlRow({ moisture_label: null, moisture_breakdown: '' }))).toBe(false)
  })
})

describe('hasMoistureDeduction (P&L Moisture Deduction table filter, §8.1)', () => {
  it('accepts an entry with an actual deduction', () => {
    expect(hasMoistureDeduction(entry(98.75))).toBe(true)
  })

  it('rejects a moisture-cleared entry (total deduction 0)', () => {
    expect(hasMoistureDeduction(entry(0))).toBe(false)
  })
})

describe('sumDeductionLb (Total over the DISPLAYED deduction rows)', () => {
  it('sums the displayed entries\' deduction pounds', () => {
    expect(sumDeductionLb([entry(98.75), entry(100)])).toBeCloseTo(198.75, 6)
  })

  it('is 0 for no displayed entries', () => {
    expect(sumDeductionLb([])).toBe(0)
  })
})

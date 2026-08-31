import { describe, expect, it } from 'vitest';

import type { MoistureLabelValue } from '@/domain/paddy/moisture';
import { buildPnlRow, summarizePnl, computeDeductionAmount } from './report';

function snapshot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    purchase_no: 'PSO-202608-0001',
    date: '2026-08-01',
    farmer_name: 'Ko Aung',
    rice_type_name: 'Emata',
    gross_pound: 100,
    moisture_label: null as MoistureLabelValue,
    moisture_loss: 0,
    net_pound: 100,
    price_per_tin: 40_000,
    total_amount: 2_000,
    ...overrides,
  };
}

describe('buildPnlRow (§8)', () => {
  it('assembles a row from a snapshot, passing stored values through unchanged', () => {
    const row = buildPnlRow(
      snapshot({ gross_pound: 506, moisture_loss: 20.24, net_pound: 485.76, total_amount: 179_731.2 }),
    );
    expect(row.gross_pound).toBe(506);
    expect(row.moisture_loss).toBe(20.24);
    expect(row.net_pound).toBe(485.76);
    expect(row.total_amount).toBe(179_731.2);
  });

  it('builds the moisture breakdown from the bag rows (ascending, no unit)', () => {
    const row = buildPnlRow(snapshot(), [
      { weight_lb: 100, moisture_label: 18 },
      { weight_lb: 100, moisture_label: 17 },
      { weight_lb: 100, moisture_label: 17 },
      { weight_lb: 100, moisture_label: null },
    ]);
    expect(row.moisture_breakdown).toBe('17:2, 18:1');
  });

  it('empty breakdown when there are no labeled bags', () => {
    expect(buildPnlRow(snapshot(), []).moisture_breakdown).toBe('');
  });
});

describe('summarizePnl (§8)', () => {
  it('sums the snapshot values across rows', () => {
    const rows = [
      buildPnlRow(snapshot({ gross_pound: 100, moisture_loss: 0, net_pound: 100, total_amount: 2_000 })),
      buildPnlRow(snapshot({ gross_pound: 506, moisture_loss: 20.24, net_pound: 485.76, total_amount: 9_715 })),
      buildPnlRow(snapshot({ gross_pound: 205, moisture_loss: 0, net_pound: 205, total_amount: 4_100 })),
    ];
    const summary = summarizePnl(rows);
    expect(summary.purchase_count).toBe(3);
    expect(summary.total_gross_pound).toBeCloseTo(811, 12);
    expect(summary.total_moisture_loss).toBeCloseTo(20.24, 12);
    expect(summary.total_net_pound).toBeCloseTo(790.76, 12);
    expect(summary.total_amount).toBeCloseTo(15_815, 6);
  });

  it('empty list → all-zero summary', () => {
    const summary = summarizePnl([]);
    expect(summary.purchase_count).toBe(0);
    expect(summary.total_gross_pound).toBe(0);
    expect(summary.total_moisture_loss).toBe(0);
    expect(summary.total_net_pound).toBe(0);
    expect(summary.total_amount).toBe(0);
  });
});

describe('computeDeductionAmount (§8.1)', () => {
  it('values the deduction tin+extra at the stored tin price', () => {
    // 98.75 lb @ 50 lb/tin → 1 tin + 48.75 lb extra → 40,000 + 39,000 = 79,000
    expect(computeDeductionAmount(98.75, 40_000, 50)).toBeCloseTo(79_000, 6);
    // 100 lb → 2 tins exactly → 80,000
    expect(computeDeductionAmount(100, 40_000, 50)).toBeCloseTo(80_000, 6);
    // 21 lb → 0 tins + 21 lb extra → 21/50 × 40,000 = 16,800
    expect(computeDeductionAmount(21, 40_000, 50)).toBeCloseTo(16_800, 6);
    // zero deduction → zero amount
    expect(computeDeductionAmount(0, 40_000, 50)).toBe(0);
  });

  it('honours a non-50 lb-per-tin configuration', () => {
    // 46 lb/tin config: 69 lb → 1 tin + 23 lb extra → 30,000 + 15,000 = 45,000
    expect(computeDeductionAmount(69, 30_000, 46)).toBeCloseTo(45_000, 6);
  });

  it('yields 0 for invalid price / lb-per-tin inputs', () => {
    expect(computeDeductionAmount(21, 0, 50)).toBe(0);
    expect(computeDeductionAmount(21, -1, 50)).toBe(0);
    expect(computeDeductionAmount(21, 40_000, 0)).toBe(0);
    expect(computeDeductionAmount(21, Number.NaN, 50)).toBe(0);
    expect(computeDeductionAmount(21, 40_000, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
import { describe, expect, it } from 'vitest';

import { computeBagTotals, computePurchaseTotals, computeTotalAmount } from './totals';
import { resolveMoistureRates } from '@/domain/paddy/moisture';
import { DEFAULT_LB_PER_TIN } from '@/domain/paddy/tins';

describe('computeBagTotals (§3)', () => {
  it('sums weights, counts bags, converts tins unrounded', () => {
    const totals = computeBagTotals([99.8, 98.4, 100]);
    expect(totals.total_bags).toBe(3);
    expect(totals.total_pounds).toBeCloseTo(298.2, 12);
    expect(totals.total_tins).toBeCloseTo(5.964, 12);
  });

  it('handles 250 lb = 5 tins and 1 lb = 0.02 tins (never rounded)', () => {
    expect(computeBagTotals([250]).total_tins).toBe(5);
    expect(computeBagTotals([1]).total_tins).toBeCloseTo(0.02, 12);
  });

  it('respects a custom lb-per-tin', () => {
    expect(computeBagTotals([100], 100).total_tins).toBe(1);
  });
});

describe('computeTotalAmount (§3)', () => {
  it('5.964 tins × 18,500 MMK = 110,334 MMK', () => {
    expect(computeTotalAmount(5.964, 18_500)).toBeCloseTo(110_334, 6);
  });

  it('5.97 tins × 18,500 MMK = 110,445 MMK', () => {
    expect(computeTotalAmount(5.97, 18_500)).toBeCloseTo(110_445, 6);
  });
});

describe('computePurchaseTotals (§3 / §4.3)', () => {
  it('acceptance: label 18, weights 97.5/103/98/105/102.5 at 18,500/tin', () => {
    const rows = [
      { weight_lb: 97.5, moisture_label: 18 as const },
      { weight_lb: 103, moisture_label: 18 as const },
      { weight_lb: 98, moisture_label: 18 as const },
      { weight_lb: 105, moisture_label: 18 as const },
      { weight_lb: 102.5, moisture_label: 18 as const },
    ];
    const totals = computePurchaseTotals({ rows, price_per_tin: 18_500 });
    expect(totals.total_bags).toBe(5);
    expect(totals.gross_pound).toBeCloseTo(506, 12);
    expect(totals.moisture_loss).toBeCloseTo(20.24, 12);
    expect(totals.net_pound).toBeCloseTo(485.76, 12);
    // tins from NET pound: 485.76 / 50
    expect(totals.total_tins).toBeCloseTo(9.7152, 12);
    expect(totals.total_amount).toBeCloseTo(9.7152 * 18_500, 6);
  });

  it('regression: None moisture → gross = net; tins from gross', () => {
    const totals = computePurchaseTotals({
      rows: [
        { weight_lb: 100, moisture_label: null },
        { weight_lb: 105, moisture_label: null },
      ],
      price_per_tin: 18_000,
    });
    expect(totals.gross_pound).toBe(205);
    expect(totals.moisture_loss).toBe(0);
    expect(totals.net_pound).toBe(205);
    expect(totals.total_tins).toBeCloseTo(4.1, 12);
    expect(totals.total_amount).toBeCloseTo(4.1 * 18_000, 6);
  });

  it('uses configured (Settings) rates when provided', () => {
    const rates = resolveMoistureRates({ 18: 5 });
    const totals = computePurchaseTotals({
      rows: [{ weight_lb: 100, moisture_label: 18 }],
      price_per_tin: 100,
      rates,
    });
    expect(totals.moisture_loss).toBeCloseTo(10, 12); // 100/50 × 5
    expect(totals.net_pound).toBeCloseTo(90, 12);
    expect(totals.total_tins).toBeCloseTo(1.8, 12);
  });

  it('zero rows ⇒ zero totals (§6.2)', () => {
    const totals = computePurchaseTotals({ rows: [], price_per_tin: 18_500 });
    expect(totals.total_bags).toBe(0);
    expect(totals.total_pounds).toBe(0);
    expect(totals.total_tins).toBe(0);
    expect(totals.total_amount).toBe(0);
    expect(totals.gross_pound).toBe(0);
    expect(totals.moisture_loss).toBe(0);
    expect(totals.net_pound).toBe(0);
  });

  it('exposes the default 50 lb/tin constant', () => {
    expect(DEFAULT_LB_PER_TIN).toBe(50);
  });
});
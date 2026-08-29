import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MOISTURE_RATES,
  MOISTURE_BASIS_LB,
  MOISTURE_LABEL_OPTIONS,
  computeMoistureTotals,
  isValidMoistureLabel,
  moistureLossForWeight,
  moistureRateForLabel,
  resolveMoistureRates,
} from './moisture';

describe('moisture: default configured rates (§4.1)', () => {
  it('ships the exact documented defaults', () => {
    expect(DEFAULT_MOISTURE_RATES).toEqual({ 17: 1, 18: 2, 19: 3, 20: 4 });
    expect(MOISTURE_LABEL_OPTIONS).toEqual([17, 18, 19, 20]);
    expect(MOISTURE_BASIS_LB).toBe(50);
  });

  it('returns 0 for null/None/undefined and for unknown labels', () => {
    expect(moistureRateForLabel(null)).toBe(0);
    expect(moistureRateForLabel(undefined)).toBe(0);
    expect(moistureRateForLabel(99)).toBe(0);
    expect(moistureRateForLabel(16)).toBe(0);
  });

  it('validates allowed labels only: null, 17, 18, 19, 20 valid; others invalid', () => {
    expect(isValidMoistureLabel(null)).toBe(true);
    expect(isValidMoistureLabel(undefined)).toBe(true);
    for (const label of MOISTURE_LABEL_OPTIONS) expect(isValidMoistureLabel(label)).toBe(true);
    expect(isValidMoistureLabel(16)).toBe(false);
    expect(isValidMoistureLabel(21)).toBe(false);
    expect(isValidMoistureLabel(0)).toBe(false);
  });
});

describe('moisture: configured-rate resolution', () => {
  it('merges configured values over the defaults', () => {
    expect(resolveMoistureRates({ 18: 5 })).toEqual({ 17: 1, 18: 5, 19: 3, 20: 4 });
  });

  it('falls back to the default for invalid configured values', () => {
    expect(resolveMoistureRates({ 17: -1, 18: Number.NaN, 19: 'x' as unknown as number })).toEqual(
      { 17: 1, 18: 2, 19: 3, 20: 4 },
    );
    expect(resolveMoistureRates(null)).toEqual({ 17: 1, 18: 2, 19: 3, 20: 4 });
  });

  it('uses configured values in the loss formula', () => {
    const rates = resolveMoistureRates({ 18: 5 });
    expect(moistureLossForWeight(100, 18, rates)).toBe(10); // 100/50 × 5
  });
});

describe('moistureLossForWeight (§4.2)', () => {
  it('applies 17 → 1 lb per 50 lb', () => {
    expect(moistureLossForWeight(100, 17)).toBe(2);
    expect(moistureLossForWeight(9_780, 17)).toBeCloseTo(195.6, 12);
  });

  it('applies 18 → 2 lb per 50 lb', () => {
    expect(moistureLossForWeight(50, 18)).toBe(2);
    expect(moistureLossForWeight(506, 18)).toBeCloseTo(20.24, 12);
  });

  it('applies 19 → 3 lb per 50 lb', () => {
    expect(moistureLossForWeight(50, 19)).toBe(3);
    expect(moistureLossForWeight(100, 19)).toBe(6);
  });

  it('applies 20 → 4 lb per 50 lb', () => {
    expect(moistureLossForWeight(50, 20)).toBe(4);
    expect(moistureLossForWeight(100, 20)).toBe(8);
  });

  it('None → zero loss even for large weights', () => {
    expect(moistureLossForWeight(205, null)).toBe(0);
  });
});
import { formatMoistureLabelCount, moistureAdjustedWeight } from './moisture';

describe('computeMoistureTotals (§4.3)', () => {
  it('acceptance: label 18 across 97.5/103/98/105/102.5 → gross 506, loss 20.24, net 485.76', () => {
    const rows = [
      { weight_lb: 97.5, moisture_label: 18 as const },
      { weight_lb: 103, moisture_label: 18 as const },
      { weight_lb: 98, moisture_label: 18 as const },
      { weight_lb: 105, moisture_label: 18 as const },
      { weight_lb: 102.5, moisture_label: 18 as const },
    ];
    const totals = computeMoistureTotals(rows);
    expect(totals.gross_pound).toBeCloseTo(506, 12);
    expect(totals.moisture_loss).toBeCloseTo(20.24, 12);
    expect(totals.net_pound).toBeCloseTo(485.76, 12);
  });

  it('bag count is never used in the deduction (same gross, different counts)', () => {
    const oneBag = computeMoistureTotals([{ weight_lb: 506, moisture_label: 18 }]);
    const fiveBags = computeMoistureTotals([
      { weight_lb: 97.5, moisture_label: 18 },
      { weight_lb: 103, moisture_label: 18 },
      { weight_lb: 98, moisture_label: 18 },
      { weight_lb: 105, moisture_label: 18 },
      { weight_lb: 102.5, moisture_label: 18 },
    ]);
    expect(oneBag.net_pound).toBeCloseTo(fiveBags.net_pound, 12);
  });

  it('regression: None moisture → gross = net, loss 0', () => {
    const totals = computeMoistureTotals([
      { weight_lb: 100, moisture_label: null },
      { weight_lb: 105, moisture_label: null },
    ]);
    expect(totals.gross_pound).toBe(205);
    expect(totals.moisture_loss).toBe(0);
    expect(totals.net_pound).toBe(205);
  });

  it('Pattern 2: mixed row-level labels sum correctly', () => {
    const totals = computeMoistureTotals([
      { weight_lb: 100, moisture_label: 18 }, // loss 4
      { weight_lb: 80, moisture_label: null }, // loss 0
      { weight_lb: 120, moisture_label: 19 }, // loss 7.2
    ]);
    expect(totals.gross_pound).toBeCloseTo(300, 12);
    expect(totals.moisture_loss).toBeCloseTo(11.2, 12);
    expect(totals.net_pound).toBeCloseTo(288.8, 12);
  });
});

describe('moistureAdjustedWeight (§4.6)', () => {
  it('subtracts the per-row deduction from the actual weight', () => {
    expect(moistureAdjustedWeight(100, 18)).toBeCloseTo(96, 12);
    expect(moistureAdjustedWeight(80, 18)).toBeCloseTo(76.8, 12);
    expect(moistureAdjustedWeight(120, 19)).toBeCloseTo(112.8, 12);
  });

  it('no moisture → adjusted equals original', () => {
    expect(moistureAdjustedWeight(100, null)).toBe(100);
    expect(moistureAdjustedWeight(80, undefined)).toBe(80);
  });

  it('Pattern 1: sum of adjusted rows equals netPound (no drift)', () => {
    const rows = [100, 100, 100, 100, 100, 100, 100, 100, 100, 78]; // gross 978 lb
    const gross = rows.reduce((a, b) => a + b, 0);
    const adjustedSum = rows.reduce((a, w) => a + moistureAdjustedWeight(w, 18), 0);
    const expectedNet = gross - (gross / 50) * 2; // label 18 → rate 2
    expect(adjustedSum).toBeCloseTo(expectedNet, 12);
  });
});

describe('formatMoistureLabelCount (§8)', () => {
  it('renders label counts only, ascending, no unit, ignoring None', () => {
    expect(
      formatMoistureLabelCount([
        { weight_lb: 100, moisture_label: 18 },
        { weight_lb: 105, moisture_label: 17 },
        { weight_lb: 98, moisture_label: 17 },
        { weight_lb: 102, moisture_label: 19 },
        { weight_lb: 110, moisture_label: 20 },
        { weight_lb: 120, moisture_label: null },
        { weight_lb: 80, moisture_label: null },
      ]),
    ).toBe('17:2, 18:1, 19:1, 20:1');
  });

  it('all default (no label) → empty string', () => {
    expect(
      formatMoistureLabelCount([
        { weight_lb: 100, moisture_label: null },
        { weight_lb: 105, moisture_label: null },
      ]),
    ).toBe('');
  });

  it('ascending order regardless of input order', () => {
    expect(
      formatMoistureLabelCount([
        { weight_lb: 100, moisture_label: 20 },
        { weight_lb: 105, moisture_label: 17 },
        { weight_lb: 110, moisture_label: 19 },
      ]),
    ).toBe('17:1, 19:1, 20:1');
  });
});


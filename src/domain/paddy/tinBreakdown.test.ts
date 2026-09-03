import { describe, expect, it } from 'vitest';
import { decomposeDeductionPound, decomposeNetPound } from './tinBreakdown';

describe('decomposeNetPound (Tin + Extra Lb, PROJECT_SPEC §4/§10)', () => {
  it('decomposes 148 net lb into 2 Tin + 48 Extra Lb at 50 lb/tin', () => {
    expect(decomposeNetPound(148, 50)).toEqual({ tins: 2, extraLb: 48 });
  });

  it('decomposes 394 net lb into 7 Tin + 44 Extra Lb at 50 lb/tin (Tin is floored, never 7.88)', () => {
    // 394 / 50 = 7.88 → whole tins = floor(7.88) = 7; extra = 394 − 7×50 = 44.
    expect(decomposeNetPound(394, 50)).toEqual({ tins: 7, extraLb: 44 });
    expect(decomposeNetPound(394, 50).tins).not.toBe(7.88);
  });

  it('decomposes an exact multiple with zero extra pounds', () => {
    expect(decomposeNetPound(100, 50)).toEqual({ tins: 2, extraLb: 0 });
  });

  it('decomposes the boundary cases 350 / 399 / 400 lb at 50 lb/tin', () => {
    expect(decomposeNetPound(350, 50)).toEqual({ tins: 7, extraLb: 0 });
    expect(decomposeNetPound(399, 50)).toEqual({ tins: 7, extraLb: 49 });
    expect(decomposeNetPound(400, 50)).toEqual({ tins: 8, extraLb: 0 });
  });

  it('uses the configured lb-per-tin, not a hard-coded 50', () => {
    expect(decomposeNetPound(148, 46)).toEqual({ tins: 3, extraLb: 10 });
  });

  it('handles fractional net pounds without rounding the remainder away', () => {
    // 97.5 lb at 50 → 1 tin + 47.5 extra (exact, no intermediate rounding).
    expect(decomposeNetPound(97.5, 50)).toEqual({ tins: 1, extraLb: 47.5 });
  });

  it('keeps the existing Pattern 1 case unchanged (475 net lb @50 → 9 Tin + 25 Extra Lb)', () => {
    // Matches the PDF-voucher Pattern 1 fixture (label-17 deduction already
    // reflected in the net pound). 475 / 50 = 9.5 → 9 whole tins + 25 ext lb.
    expect(decomposeNetPound(475, 50)).toEqual({ tins: 9, extraLb: 25 });
  });

  it('keeps the existing Pattern 2 case unchanged (375 net lb @50 → 7 Tin + 25 Extra Lb)', () => {
    // Matches the PDF-voucher Pattern 2 fixture. 375 / 50 = 7.5 → 7 + 25.
    expect(decomposeNetPound(375, 50)).toEqual({ tins: 7, extraLb: 25 });
  });

  it('is safe for zero/negative/non-finite input', () => {
    expect(decomposeNetPound(0, 50)).toEqual({ tins: 0, extraLb: 0 });
    expect(decomposeNetPound(-10, 50)).toEqual({ tins: 0, extraLb: 0 });
    expect(decomposeNetPound(Number.NaN, 50)).toEqual({ tins: 0, extraLb: 0 });
  });
});

describe('decomposeDeductionPound (P&L §8.1 — deduction lb → Tin + Extra Lb)', () => {
  it('decomposes a 98.75 lb deduction into 1 Tin + 48.75 Extra Lb at 50 lb/tin', () => {
    // 98.75 is binary-exact, so no float artefact in the remainder.
    expect(decomposeDeductionPound(98.75, 50)).toEqual({ tins: 1, extraLb: 48.75 });
  });

  it('keeps sub-tin deductions entirely as Extra Lb (never reads net pound)', () => {
    // 21 lb deduction → 0 tins + 21 lb extra (a 1901.2 net lb would say 38 tins).
    expect(decomposeDeductionPound(21, 50)).toEqual({ tins: 0, extraLb: 21 });
    expect(decomposeDeductionPound(8.75, 50)).toEqual({ tins: 0, extraLb: 8.75 });
  });

  it('lands exactly on a tin boundary with zero extra pounds', () => {
    expect(decomposeDeductionPound(100, 50)).toEqual({ tins: 2, extraLb: 0 });
  });

  it('uses the configured lb-per-tin, not a hard-coded 50', () => {
    expect(decomposeDeductionPound(98.75, 46)).toEqual({ tins: 2, extraLb: 6.75 });
  });

  it('is safe for zero/negative/non-finite input', () => {
    expect(decomposeDeductionPound(0, 50)).toEqual({ tins: 0, extraLb: 0 });
    expect(decomposeDeductionPound(-10, 50)).toEqual({ tins: 0, extraLb: 0 });
    expect(decomposeDeductionPound(Number.NaN, 50)).toEqual({ tins: 0, extraLb: 0 });
  });
});

import { describe, expect, it } from 'vitest';
import {
  decomposeDeductionPound,
  decomposeNetPound,
  totalDeductionTinBreakdown,
} from './tinBreakdown';

describe('decomposeNetPound (Tin + Extra Lb, PROJECT_SPEC §4/§10)', () => {
  it('decomposes 148 net lb into 2 Tin + 48 Extra Lb at 50 lb/tin', () => {
    expect(decomposeNetPound(148, 50)).toEqual({ tins: 2, extraLb: 48 });
  });

  it('decomposes an exact multiple with zero extra pounds', () => {
    expect(decomposeNetPound(100, 50)).toEqual({ tins: 2, extraLb: 0 });
  });

  it('uses the configured lb-per-tin, not a hard-coded 50', () => {
    expect(decomposeNetPound(148, 46)).toEqual({ tins: 3, extraLb: 10 });
  });

  it('handles fractional net pounds without rounding the remainder away', () => {
    // 97.5 lb at 50 → 1 tin + 47.5 extra (exact, no intermediate rounding).
    expect(decomposeNetPound(97.5, 50)).toEqual({ tins: 1, extraLb: 47.5 });
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

describe('totalDeductionTinBreakdown (P&L §8.1 — Moisture Deduction Total row)', () => {
  it('is identical to decomposing the summed deduction pounds', () => {
    // 98.75 · 2 = 197.5 lb → 3 Tin + 47.5 Extra lb at 50 lb/tin (NOT 2 Tin +
    // 97.5 Extra, which is what summing each row's parts would give).
    expect(totalDeductionTinBreakdown([98.75, 98.75], 50)).toEqual({ tins: 3, extraLb: 47.5 });
  });

  it('aggregates multiple deduction pounds across customers/types/prices', () => {
    // 3 rows: 21 + 100 + 79 = 200 lb → exactly 4 Tin + 0 Extra at 50 lb/tin.
    expect(totalDeductionTinBreakdown([21, 100, 79], 50)).toEqual({ tins: 4, extraLb: 0 });
  });

  it('uses the configured lb-per-tin, not a hard-coded 50', () => {
    // 98.75 · 2 = 197.5 lb at 46 lb/tin → 4 Tin + 13.5 Extra lb.
    expect(totalDeductionTinBreakdown([98.75, 98.75], 46)).toEqual({ tins: 4, extraLb: 13.5 });
  });

  it('handles a single deduction row (boundary)', () => {
    expect(totalDeductionTinBreakdown([21], 50)).toEqual({ tins: 0, extraLb: 21 });
    expect(totalDeductionTinBreakdown([100], 50)).toEqual({ tins: 2, extraLb: 0 });
  });

  it('is safe for zero/negative/non-finite inputs', () => {
    expect(totalDeductionTinBreakdown([], 50)).toEqual({ tins: 0, extraLb: 0 });
    expect(totalDeductionTinBreakdown([0, 50], 50)).toEqual({ tins: 1, extraLb: 0 });
    expect(totalDeductionTinBreakdown([Number.NaN, 50], 50)).toEqual({ tins: 0, extraLb: 0 });
    expect(totalDeductionTinBreakdown([50], 0)).toEqual({ tins: 0, extraLb: 0 });
  });
});

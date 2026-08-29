import { describe, expect, it } from 'vitest';
import { decomposeNetPound } from './tinBreakdown';

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

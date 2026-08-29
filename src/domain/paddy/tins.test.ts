import { describe, expect, it } from 'vitest';

import { DEFAULT_LB_PER_TIN, poundsToTins, resolveLbPerTin } from './tins';

describe('poundsToTins (DOMAIN_RULES §3)', () => {
  it('converts with the documented examples', () => {
    expect(poundsToTins(50, 50)).toBe(1);
    expect(poundsToTins(100, 50)).toBe(2);
    expect(poundsToTins(250, 50)).toBe(5);
    expect(poundsToTins(298.5, 50)).toBeCloseTo(5.97, 12);
    expect(poundsToTins(99.8, 50)).toBeCloseTo(1.996, 12);
    expect(poundsToTins(1, 50)).toBeCloseTo(0.02, 12);
  });

  it('never rounds tin values — 1 lb stays 0.02 tins', () => {
    expect(poundsToTins(1, 50)).not.toBe(0);
    expect(poundsToTins(1, 50)).toBeCloseTo(0.02, 12);
  });

  it('defaults to 50 lb per tin', () => {
    expect(DEFAULT_LB_PER_TIN).toBe(50);
    expect(poundsToTins(50)).toBe(1);
    expect(poundsToTins(150)).toBe(3);
  });
});

describe('resolveLbPerTin (DOMAIN_RULES §1)', () => {
  it('uses the stored tin_formula when valid (finite, > 0)', () => {
    expect(resolveLbPerTin('50')).toBe(50);
    expect(resolveLbPerTin('62.5')).toBe(62.5);
    expect(resolveLbPerTin(40)).toBe(40);
  });

  it('falls back to 50 when missing or invalid', () => {
    expect(resolveLbPerTin(null)).toBe(50);
    expect(resolveLbPerTin(undefined)).toBe(50);
    expect(resolveLbPerTin('')).toBe(50);
    expect(resolveLbPerTin('abc')).toBe(50);
    expect(resolveLbPerTin('0')).toBe(50);
    expect(resolveLbPerTin('-5')).toBe(50);
  });
});

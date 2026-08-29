import { describe, expect, it } from 'vitest';

import { formatPriceShorthand, parsePriceFormat } from './price';

describe('Myanmar rice price shorthand A/B (§5.1)', () => {
  it('parses 18/50000 as 1,850,000 MMK per 100 tins; 1 tin = 18,500 MMK', () => {
    const parsed = parsePriceFormat('18/50000');
    expect(parsed).not.toBeNull();
    expect(parsed!.price_100_tin).toBe(1_850_000);
    expect(parsed!.price_per_tin).toBe(18_500);
  });

  it('parses 18/30000 as 1,830,000 MMK per 100 tins; 1 tin = 18,300 MMK', () => {
    const parsed = parsePriceFormat('18/30000');
    expect(parsed).not.toBeNull();
    expect(parsed!.price_100_tin).toBe(1_830_000);
    expect(parsed!.price_per_tin).toBe(18_300);
  });

  it('is NOT a mathematical fraction', () => {
    const parsed = parsePriceFormat('18/50000');
    // 18/50000 as a fraction would be 0.00036 — the app must never do this.
    expect(parsed!.price_100_tin).toBeGreaterThan(1_000_000);
  });

  it('formula: price_100_tin = A × 100,000 + B', () => {
    const parsed = parsePriceFormat('7/12345');
    expect(parsed).not.toBeNull();
    expect(parsed!.price_100_tin).toBe(712_345);
    expect(parsed!.price_per_tin).toBe(7_123.45);
  });

  it('trims surrounding whitespace', () => {
    expect(parsePriceFormat('  18/50000  ')).not.toBeNull();
  });

  it('rejects invalid formats', () => {
    expect(parsePriceFormat('1850000')).toBeNull();
    expect(parsePriceFormat('18')).toBeNull();
    expect(parsePriceFormat('18/')).toBeNull();
    expect(parsePriceFormat('/50000')).toBeNull();
    expect(parsePriceFormat('abc/def')).toBeNull();
    expect(parsePriceFormat('1/2/3')).toBeNull();
    expect(parsePriceFormat('')).toBeNull();
  });

  it('rejects when price_100_tin is not > 0', () => {
    expect(parsePriceFormat('0/0')).toBeNull();
  });
});

describe('formatPriceShorthand (§5.1)', () => {
  it('formats prices back into the shorthand A/BBBBB', () => {
    expect(formatPriceShorthand(1_850_000)).toBe('18/50000');
    expect(formatPriceShorthand(1_830_000)).toBe('18/30000');
  });

  it('zero-pads the B part to 5 digits', () => {
    expect(formatPriceShorthand(1_805_000)).toBe('18/05000');
  });

  it('falls back to a plain number for non-integer or non-positive values', () => {
    expect(formatPriceShorthand(18.5)).toBe('18.5');
    expect(formatPriceShorthand(-5)).toBe('-5');
    expect(formatPriceShorthand(0)).toBe('0');
  });
});
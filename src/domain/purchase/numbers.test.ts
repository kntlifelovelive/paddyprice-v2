import { describe, expect, it } from 'vitest';

import {
  formatPurchaseSequence,
  generateNextPurchaseNo,
  nextPurchaseSequence,
  purchaseNumberPrefix,
} from './numbers';

describe('purchase numbers (§6.1)', () => {
  it('builds the PSO-YYYYMM prefix from a YYYY-MM-DD date', () => {
    expect(purchaseNumberPrefix('2026-08-15')).toBe('PSO-202608');
  });

  it('generates the next number continuing the monthly sequence', () => {
    const existing = ['PSO-202608-0001', 'PSO-202608-0002'];
    expect(generateNextPurchaseNo('2026-08-20', existing)).toBe('PSO-202608-0003');
  });

  it('continues from the highest suffix — not merely one over the record count', () => {
    const existing = ['PSO-202608-0001', 'PSO-202608-0005', 'PSO-202608-0003'];
    expect(nextPurchaseSequence(existing, '2026-08-20')).toBe(6);
    expect(generateNextPurchaseNo('2026-08-20', existing)).toBe('PSO-202608-0006');
  });

  it('ignores numbers from other months (resets per calendar month)', () => {
    const existing = ['PSO-202607-0003', 'PSO-202607-0042'];
    expect(generateNextPurchaseNo('2026-08-01', existing)).toBe('PSO-202608-0001');
  });

  it('starts at 0001 when the month has no numbers yet', () => {
    expect(generateNextPurchaseNo('2026-09-01', [])).toBe('PSO-202609-0001');
    expect(generateNextPurchaseNo('2026-09-30', ['PSO-202608-0009'])).toBe('PSO-202609-0001');
  });

  it('zero-pads the 4-digit sequence', () => {
    expect(formatPurchaseSequence(1)).toBe('0001');
    expect(formatPurchaseSequence(7)).toBe('0007');
    expect(formatPurchaseSequence(42)).toBe('0042');
    expect(formatPurchaseSequence(1234)).toBe('1234');
  });
});
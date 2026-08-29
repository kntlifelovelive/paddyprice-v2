import { describe, expect, it } from 'vitest';

import { canFinalizePurchase } from './finalize';

describe('canFinalizePurchase (§7)', () => {
  it('requires at least one bag', () => {
    expect(canFinalizePurchase(0)).toBe(false);
  });

  it('allows finalizing with one or more bags', () => {
    expect(canFinalizePurchase(1)).toBe(true);
    expect(canFinalizePurchase(5)).toBe(true);
  });
});
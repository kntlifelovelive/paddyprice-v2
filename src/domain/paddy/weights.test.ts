import { describe, expect, it } from 'vitest';

import { validateWeight } from './weights';

describe('validateWeight (DOMAIN_RULES §2.2)', () => {
  it('accepts valid decimal weights and stores the parsed number', () => {
    expect(validateWeight('98')).toEqual({ ok: true, value: 98 });
    expect(validateWeight('98.4')).toEqual({ ok: true, value: 98.4 });
    expect(validateWeight('100.25')).toEqual({ ok: true, value: 100.25 });
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateWeight('  98.5  ')).toEqual({ ok: true, value: 98.5 });
  });

  it('rejects empty input', () => {
    expect(validateWeight('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateWeight('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects non-numeric input', () => {
    expect(validateWeight('abc')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(validateWeight('12x')).toEqual({ ok: false, reason: 'not-a-number' });
    expect(validateWeight('Infinity')).toEqual({ ok: false, reason: 'not-a-number' });
  });

  it('rejects negative weights', () => {
    expect(validateWeight('-5')).toEqual({ ok: false, reason: 'negative' });
    expect(validateWeight('-0.5')).toEqual({ ok: false, reason: 'negative' });
  });

  it('rejects zero', () => {
    expect(validateWeight('0')).toEqual({ ok: false, reason: 'zero' });
    expect(validateWeight('0.0')).toEqual({ ok: false, reason: 'zero' });
  });

  it('never rejects duplicates — the same weight may be entered again (§2.3)', () => {
    expect(validateWeight('98')).toEqual({ ok: true, value: 98 });
    expect(validateWeight('98')).toEqual({ ok: true, value: 98 });
  });
});

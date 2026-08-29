import { describe, expect, it } from 'vitest';

import type { MoistureLabelValue } from '@/domain/paddy/moisture';
import { buildPnlRow, summarizePnl } from './report';

function snapshot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    purchase_no: 'PSO-202608-0001',
    date: '2026-08-01',
    farmer_name: 'Ko Aung',
    rice_type_name: 'Emata',
    gross_pound: 100,
    moisture_label: null as MoistureLabelValue,
    moisture_loss: 0,
    net_pound: 100,
    total_amount: 2_000,
    ...overrides,
  };
}

describe('buildPnlRow (§8)', () => {
  it('assembles a row from a snapshot, passing stored values through unchanged', () => {
    const row = buildPnlRow(
      snapshot({ gross_pound: 506, moisture_loss: 20.24, net_pound: 485.76, total_amount: 179_731.2 }),
    );
    expect(row.gross_pound).toBe(506);
    expect(row.moisture_loss).toBe(20.24);
    expect(row.net_pound).toBe(485.76);
    expect(row.total_amount).toBe(179_731.2);
  });

  it('builds the moisture breakdown from the bag rows (ascending, no unit)', () => {
    const row = buildPnlRow(snapshot(), [
      { weight_lb: 100, moisture_label: 18 },
      { weight_lb: 100, moisture_label: 17 },
      { weight_lb: 100, moisture_label: 17 },
      { weight_lb: 100, moisture_label: null },
    ]);
    expect(row.moisture_breakdown).toBe('17:2, 18:1');
  });

  it('empty breakdown when there are no labeled bags', () => {
    expect(buildPnlRow(snapshot(), []).moisture_breakdown).toBe('');
  });
});

describe('summarizePnl (§8)', () => {
  it('sums the snapshot values across rows', () => {
    const rows = [
      buildPnlRow(snapshot({ gross_pound: 100, moisture_loss: 0, net_pound: 100, total_amount: 2_000 })),
      buildPnlRow(snapshot({ gross_pound: 506, moisture_loss: 20.24, net_pound: 485.76, total_amount: 9_715 })),
      buildPnlRow(snapshot({ gross_pound: 205, moisture_loss: 0, net_pound: 205, total_amount: 4_100 })),
    ];
    const summary = summarizePnl(rows);
    expect(summary.purchase_count).toBe(3);
    expect(summary.total_gross_pound).toBeCloseTo(811, 12);
    expect(summary.total_moisture_loss).toBeCloseTo(20.24, 12);
    expect(summary.total_net_pound).toBeCloseTo(790.76, 12);
    expect(summary.total_amount).toBeCloseTo(15_815, 6);
  });

  it('empty list → all-zero summary', () => {
    const summary = summarizePnl([]);
    expect(summary.purchase_count).toBe(0);
    expect(summary.total_gross_pound).toBe(0);
    expect(summary.total_moisture_loss).toBe(0);
    expect(summary.total_net_pound).toBe(0);
    expect(summary.total_amount).toBe(0);
  });
});
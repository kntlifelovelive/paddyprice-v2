import { describe, expect, it } from 'vitest';

import type { PurchaseSnapshot } from '@/domain/purchase/types';
import {
  buildDashboardGroupRows,
  countDistinctFarmers,
  countDistinctPurchaseDates,
  summarizeByMonth,
  summarizeByRiceType,
  summarizePurchases,
} from './summaries';

function purchase(overrides: Partial<PurchaseSnapshot>): PurchaseSnapshot {
  return {
    id: 1,
    purchase_no: 'PSO-202608-0001',
    date: '2026-08-01',
    farmer_id: 1,
    farmer_name: 'Ko Aung',
    rice_type_id: 10,
    rice_type_name: 'Emata',
    price_100_tin: 1_850_000,
    price_per_tin: 18_500,
    total_bags: 3,
    total_pounds: 300,
    total_tins: 6,
    total_amount: 111_000,
    gross_pound: 300,
    moisture_loss: 0,
    net_pound: 300,
    moisture_label: null,
    moisture_rates: { 17: 1, 18: 2, 19: 3, 20: 4 },
    ...overrides,
  };
}

describe('summarizePurchases / counts (§9.1)', () => {
  it('sums stored snapshot columns and counts records', () => {
    const purchases = [
      purchase({ id: 1, date: '2026-08-01', total_bags: 2, total_pounds: 200, total_tins: 4, total_amount: 74_000, farmer_id: 1 }),
      purchase({ id: 2, date: '2026-08-05', total_bags: 3, total_pounds: 300, total_tins: 6, total_amount: 111_000, farmer_id: 2 }),
    ];
    const agg = summarizePurchases(purchases);
    expect(agg.purchase_count).toBe(2);
    expect(agg.total_bags).toBe(5);
    expect(agg.total_pounds).toBe(500);
    expect(agg.total_tins).toBe(10);
    expect(agg.total_amount).toBe(185_000);
  });

  it('counts distinct farmers and distinct purchase dates', () => {
    const purchases = [
      purchase({ id: 1, farmer_id: 1, date: '2026-08-01' }),
      purchase({ id: 2, farmer_id: 2, date: '2026-08-01' }),
      purchase({ id: 3, farmer_id: 1, date: '2026-08-05' }),
    ];
    expect(countDistinctFarmers(purchases)).toBe(2);
    expect(countDistinctPurchaseDates(purchases)).toBe(2);
  });
});

describe('summarizeByMonth (§9.1)', () => {
  it('groups the same aggregates by YYYY-MM', () => {
    const purchases = [
      purchase({ id: 1, date: '2026-07-01', total_pounds: 100, total_amount: 2_000, total_bags: 1, total_tins: 2 }),
      purchase({ id: 2, date: '2026-07-20', total_pounds: 200, total_amount: 4_000, total_bags: 2, total_tins: 4 }),
      purchase({ id: 3, date: '2026-08-01', total_pounds: 300, total_amount: 6_000, total_bags: 3, total_tins: 6 }),
    ];
    const byMonth = summarizeByMonth(purchases);
    expect(byMonth).toHaveLength(2);
    const july = byMonth.find((r) => r.month === '2026-07')!;
    expect(july.purchase_count).toBe(2);
    expect(july.total_pounds).toBe(300);
    expect(july.total_amount).toBe(6_000);
    const august = byMonth.find((r) => r.month === '2026-08')!;
    expect(august.purchase_count).toBe(1);
  });
});

describe('summarizeByRiceType (§9.1)', () => {
  it('groups per paddy type', () => {
    const purchases = [
      purchase({ id: 1, rice_type_id: 10, rice_type_name: 'Emata', total_pounds: 100, total_amount: 2_000 }),
      purchase({ id: 2, rice_type_id: 10, rice_type_name: 'Emata', total_pounds: 200, total_amount: 4_000 }),
      purchase({ id: 3, rice_type_id: 20, rice_type_name: 'Paw San', total_pounds: 300, total_amount: 6_000 }),
    ];
    const byType = summarizeByRiceType(purchases);
    expect(byType).toHaveLength(2);
    const emata = byType.find((r) => r.rice_type_name === 'Emata')!;
    expect(emata.purchase_count).toBe(2);
    expect(emata.total_pounds).toBe(300);
    expect(emata.total_amount).toBe(6_000);
  });
});

describe('buildDashboardGroupRows (§3.2)', () => {
  it('groups by Farmer + Paddy Type + Applied Price; never merges different prices', () => {
    const purchases = [
      // same farmer+type, same price → one group
      purchase({ id: 1, farmer_id: 1, rice_type_id: 10, price_100_tin: 1_850_000, total_bags: 2, total_pounds: 200, net_pound: 200, total_tins: 4, total_amount: 74_000 }),
      purchase({ id: 2, farmer_id: 1, rice_type_id: 10, price_100_tin: 1_850_000, total_bags: 3, total_pounds: 300, net_pound: 300, total_tins: 6, total_amount: 111_000 }),
      // same farmer+type but DIFFERENT price → a separate group
      purchase({ id: 3, farmer_id: 1, rice_type_id: 10, price_100_tin: 1_900_000, price_per_tin: 19_000, total_bags: 1, total_pounds: 100, net_pound: 100, total_tins: 2, total_amount: 38_000 }),
      // different paddy type → a separate group
      purchase({ id: 4, farmer_id: 1, rice_type_id: 20, rice_type_name: 'Paw San', total_bags: 5, total_pounds: 500, net_pound: 450, total_tins: 9, total_amount: 166_500 }),
    ];
    const rows = buildDashboardGroupRows(purchases);
    expect(rows).toHaveLength(3);

    const merged = rows.find((r) => r.rice_type_name === 'Emata' && r.price_100_tin === 1_850_000)!;
    expect(merged.total_bags).toBe(5);
    expect(merged.net_pound).toBe(500);
    expect(merged.total_tins).toBe(10);
    expect(merged.total_amount).toBe(185_000);

    const secondPrice = rows.find((r) => r.rice_type_name === 'Emata' && r.price_100_tin === 1_900_000)!;
    expect(secondPrice.total_bags).toBe(1);

    const pawSan = rows.find((r) => r.rice_type_name === 'Paw San')!;
    expect(pawSan.net_pound).toBe(450); // net pound used for the Dashboard
  });
});
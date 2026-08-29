import type { PurchaseSnapshot } from '@/domain/purchase/types';

/**
 * Report summaries & aggregations — docs/DOMAIN_RULES.md §9.1 and the
 * Dashboard grouping in PROJECT_SPEC.md §3.2.
 *
 * All aggregates are PLAIN SUMS over the STORED snapshot columns — they never
 * re-derive values. Pure functions only.
 */

/** §9.1 — an aggregate over a set of purchases. */
export interface PurchaseAggregate {
  purchase_count: number;
  total_bags: number;
  total_pounds: number;
  total_tins: number;
  total_amount: number;
}

/** §9.1 — year/all-time summary: plain sums over the given purchases. */
export function summarizePurchases(
  purchases: readonly PurchaseSnapshot[],
): PurchaseAggregate {
  const aggregate: PurchaseAggregate = {
    purchase_count: 0,
    total_bags: 0,
    total_pounds: 0,
    total_tins: 0,
    total_amount: 0,
  };
  for (const p of purchases) {
    aggregate.purchase_count += 1;
    aggregate.total_bags += p.total_bags;
    aggregate.total_pounds += p.total_pounds;
    aggregate.total_tins += p.total_tins;
    aggregate.total_amount += p.total_amount;
  }
  return aggregate;
}

/** §9.1 — COUNT(DISTINCT farmer). */
export function countDistinctFarmers(purchases: readonly PurchaseSnapshot[]): number {
  return new Set(purchases.map((p) => p.farmer_id)).size;
}

/** §9.1 — COUNT(DISTINCT date). */
export function countDistinctPurchaseDates(purchases: readonly PurchaseSnapshot[]): number {
  return new Set(purchases.map((p) => p.date)).size;
}

/** §9.1 — one row of the monthly summary: aggregate for a `YYYY-MM` month. */
export interface MonthSummaryRow extends PurchaseAggregate {
  month: string;
}

/** §9.1 — monthly summary: same aggregate columns grouped by calendar month. */
export function summarizeByMonth(
  purchases: readonly PurchaseSnapshot[],
): MonthSummaryRow[] {
  const map = new Map<string, PurchaseAggregate>();
  for (const p of purchases) {
    const month = p.date.slice(0, 7); // YYYY-MM
    const row = map.get(month) ?? {
      purchase_count: 0,
      total_bags: 0,
      total_pounds: 0,
      total_tins: 0,
      total_amount: 0,
    };
    row.purchase_count += 1;
    row.total_bags += p.total_bags;
    row.total_pounds += p.total_pounds;
    row.total_tins += p.total_tins;
    row.total_amount += p.total_amount;
    map.set(month, row);
  }
  return Array.from(map, ([month, aggregate]) => ({ month, ...aggregate }));
}

/** §9.1 — one row of the per-paddy-type breakdown. */
export interface RiceTypeSummaryRow {
  rice_type_id: number;
  rice_type_name: string;
  purchase_count: number;
  total_pounds: number;
  total_tins: number;
  total_amount: number;
}

/** §9.1 — per-paddy-type breakdown over the given purchases. */
export function summarizeByRiceType(
  purchases: readonly PurchaseSnapshot[],
): RiceTypeSummaryRow[] {
  const map = new Map<number, RiceTypeSummaryRow>();
  for (const p of purchases) {
    let row = map.get(p.rice_type_id);
    if (!row) {
      row = {
        rice_type_id: p.rice_type_id,
        rice_type_name: p.rice_type_name,
        purchase_count: 0,
        total_pounds: 0,
        total_tins: 0,
        total_amount: 0,
      };
      map.set(p.rice_type_id, row);
    }
    row.purchase_count += 1;
    row.total_pounds += p.total_pounds;
    row.total_tins += p.total_tins;
    row.total_amount += p.total_amount;
  }
  return Array.from(map.values());
}

/** PROJECT_SPEC §3.2 — a Dashboard group row (a Farmer + Paddy Type + Price). */
export interface DashboardGroupRow {
  farmer_id: number;
  farmer_name: string;
  rice_type_id: number;
  rice_type_name: string;
  price_100_tin: number;
  price_per_tin: number;
  total_bags: number;
  /** §3.2 — Dashboard pound values are NET pound (after moisture). */
  net_pound: number;
  total_tins: number;
  total_amount: number;
}

/**
 * §3.2 / §5.4 — group purchases by Farmer + Paddy Type + Applied Price.
 * Records that used a different price or paddy type are NEVER merged. Group
 * order is first-seen order. Net pound is summed for the Dashboard.
 */
export function buildDashboardGroupRows(
  purchases: readonly PurchaseSnapshot[],
): DashboardGroupRow[] {
  const map = new Map<string, DashboardGroupRow>();
  for (const p of purchases) {
    const key = `${p.farmer_id}|${p.rice_type_id}|${p.price_100_tin}`;
    const existing = map.get(key);
    if (existing) {
      existing.total_bags += p.total_bags;
      existing.net_pound += p.net_pound;
      existing.total_tins += p.total_tins;
      existing.total_amount += p.total_amount;
    } else {
      map.set(key, {
        farmer_id: p.farmer_id,
        farmer_name: p.farmer_name,
        rice_type_id: p.rice_type_id,
        rice_type_name: p.rice_type_name,
        price_100_tin: p.price_100_tin,
        price_per_tin: p.price_per_tin,
        total_bags: p.total_bags,
        net_pound: p.net_pound,
        total_tins: p.total_tins,
        total_amount: p.total_amount,
      });
    }
  }
  return Array.from(map.values());
}
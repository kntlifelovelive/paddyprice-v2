import { formatMoistureLabelCount, type MoistureLabelValue } from '@/domain/paddy/moisture';
import type { BagRow } from '@/domain/purchase/totals';

/**
 * Profit & Loss — docs/DOMAIN_RULES.md §8.
 *
 * P&L reads SAVED snapshot values and never recalculates from current
 * Settings. The functions here are pure: they assemble rows and report
 * summaries from snapshot inputs already stored on each purchase.
 */

/** §8 — the stored snapshot fields a P&L row is built from. */
export interface PnlSnapshotRow {
  /** Purchase date (`YYYY-MM-DD`). */
  date: string;
  farmer_name: string;
  rice_type_name: string;
  /** §8 — stored gross pound. */
  gross_pound: number;
  /** §8 — stored moisture label. */
  moisture_label: MoistureLabelValue;
  /** §8 — stored moisture loss (lb). */
  moisture_loss: number;
  /** §8 — stored net pound. */
  net_pound: number;
  /** §8 — stored total amount (MMK). */
  total_amount: number;
}

/** §8 — a P&L row: snapshot fields plus the per-row moisture breakdown string. */
export interface PnlRow extends PnlSnapshotRow {
  /** §8 — Pattern 2 label-count string (ascending, no unit). */
  moisture_breakdown: string;
}

/**
 * §8 — build one P&L row from a purchase snapshot and its bag rows. The
 * moisture breakdown is derived from the bag rows (count of each label).
 */
export function buildPnlRow(
  snapshot: PnlSnapshotRow,
  bagRows: readonly BagRow[] = [],
): PnlRow {
  return {
    ...snapshot,
    moisture_breakdown: formatMoistureLabelCount(bagRows),
  };
}

/** §8 — report-level summary: counts and plain sums over the rows. */
export interface PnlSummary {
  purchase_count: number;
  total_gross_pound: number;
  total_moisture_loss: number;
  total_net_pound: number;
  total_amount: number;
}

/** §8 — summarize a set of P&L rows. */
export function summarizePnl(rows: readonly PnlRow[]): PnlSummary {
  let purchase_count = 0;
  let total_gross_pound = 0;
  let total_moisture_loss = 0;
  let total_net_pound = 0;
  let total_amount = 0;

  for (const row of rows) {
    purchase_count += 1;
    total_gross_pound += row.gross_pound;
    total_moisture_loss += row.moisture_loss;
    total_net_pound += row.net_pound;
    total_amount += row.total_amount;
  }

  return {
    purchase_count,
    total_gross_pound,
    total_moisture_loss,
    total_net_pound,
    total_amount,
  };
}
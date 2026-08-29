import { DEFAULT_LB_PER_TIN, poundsToTins } from '@/domain/paddy/tins';
import {
  computeMoistureTotals,
  type MoistureLabelValue,
  type MoistureRates,
} from '@/domain/paddy/moisture';

/** §2 — one bag (row) of a purchase: a weight and its moisture label. */
export interface BagRow {
  weight_lb: number;
  moisture_label: MoistureLabelValue;
}

/** §3 — plain bag totals (no moisture). */
export interface BagTotals {
  total_bags: number;
  total_pounds: number;
  total_tins: number;
}

/**
 * §3 — total over bag weights: bags = count, pounds = Σ weights, tins =
 * pounds / lb_per_tin (unrounded). No moisture is applied here.
 */
export function computeBagTotals(
  weights: readonly number[],
  lbPerTin: number = DEFAULT_LB_PER_TIN,
): BagTotals {
  const total_pounds = weights.reduce((sum, w) => sum + w, 0);
  return {
    total_bags: weights.length,
    total_pounds,
    total_tins: poundsToTins(total_pounds, lbPerTin),
  };
}

/** §3 — total payment amount in MMK = total_tins × price_per_tin (unrounded). */
export function computeTotalAmount(totalTins: number, pricePerTin: number): number {
  return totalTins * pricePerTin;
}

/** §3 — a purchase's fully-derived totals (rows are the single source of truth). */
export interface PurchaseTotals {
  total_bags: number;
  /** Gross pound = Σ bag weights. */
  total_pounds: number;
  /** Tins from NET pound, unrounded. */
  total_tins: number;
  /** MMK = total_tins × snapshot price_per_tin. */
  total_amount: number;
  gross_pound: number;
  moisture_loss: number;
  net_pound: number;
}

export interface ComputePurchaseTotalsInput {
  rows: readonly BagRow[];
  /** §5.4 — the purchase's stored price snapshot (MMK per 1 tin). */
  price_per_tin: number;
  /** §1 — effective lb per tin (default fallback 50). */
  lb_per_tin?: number;
  /** §4.1 — configured moisture deduction rates (defaults when omitted). */
  rates?: Readonly<MoistureRates>;
}

/**
 * §3 / §4.3 — derive a purchase's totals from its rows:
 * gross = Σ weights; loss = Σ (w/50 × rate); net = gross − loss; tins =
 * net / lb_per_tin (unrounded); amount = tins × price_per_tin. Zero rows ⇒
 * zero totals (confirmed §6.2).
 */
export function computePurchaseTotals({
  rows,
  price_per_tin,
  lb_per_tin = DEFAULT_LB_PER_TIN,
  rates,
}: ComputePurchaseTotalsInput): PurchaseTotals {
  const moisture = computeMoistureTotals(rows, rates);
  const total_tins = poundsToTins(moisture.net_pound, lb_per_tin);
  return {
    total_bags: rows.length,
    total_pounds: moisture.gross_pound,
    total_tins,
    total_amount: computeTotalAmount(total_tins, price_per_tin),
    gross_pound: moisture.gross_pound,
    moisture_loss: moisture.moisture_loss,
    net_pound: moisture.net_pound,
  };
}
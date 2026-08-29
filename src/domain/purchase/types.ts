import type { MoistureLabelValue, MoistureRates } from '@/domain/paddy/moisture';

/**
 * A saved purchase's immutable snapshot — docs/DOMAIN_RULES.md §2.4/§2.5.
 *
 * This is the STORED form every downstream calculation and report consumes:
 * once a purchase is saved/finalized, its prices and moisture deduction rate
 * are frozen here and never re-derived from current Settings. The domain only
 * ever reads these stored values; it never reads live Settings itself.
 *
 * (Persistence itself is implemented in a later infrastructure step: this file
 * is the pure type contract only.)
 */
export interface PurchaseSnapshot {
  id: number;
  /** §6.1 — unique, immutable `PSO-YYYYMM-NNNN`. */
  purchase_no: string;
  /** Purchase date, `YYYY-MM-DD`. */
  date: string;
  farmer_id: number;
  farmer_name: string;
  rice_type_id: number;
  rice_type_name: string;
  /** §5.4 — immutable price snapshot (MMK for 100 tins). */
  price_100_tin: number;
  /** §5.4 — immutable price snapshot (MMK for 1 tin). */
  price_per_tin: number;
  /** §3 — total bags. */
  total_bags: number;
  /** §3 — total pounds (gross). */
  total_pounds: number;
  /** §3 — total tins (from net pound), unrounded. */
  total_tins: number;
  /** §3 — total amount (MMK) = total_tins × price_per_tin. */
  total_amount: number;
  /** §4.3 — gross pound (sum of bag weights). */
  gross_pound: number;
  /** §4.3 — total moisture loss (lb). */
  moisture_loss: number;
  /** §4.3 — net pound = gross − loss. */
  net_pound: number;
  /** §4.4 — the purchase-level (Pattern 1) moisture label applied at save. */
  moisture_label: MoistureLabelValue;
  /**
   * §4.4 (V2) — the moisture deduction rates snapshotted from Settings when
   * this purchase was saved/finalized. Historical calculations, History and
   * P&L must use these stored rates, never the current Settings values.
   */
  moisture_rates: MoistureRates;
}
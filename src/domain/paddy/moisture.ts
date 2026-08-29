/**
 * Moisture calculation rules — docs/DOMAIN_RULES.md §4.
 *
 * The deduction basis is fixed at 50 lb of ACTUAL weight (never bag count,
 * never a fixed per-bag weight). The per-label deduction rates are
 * configurable in Settings (V2) and therefore arrive here as a parameter —
 * this module never reads Settings or any store itself. None / unknown labels
 * have a fixed 0 rate (not configurable).
 *
 * Pure functions only — no I/O, no platform, no UI.
 */

export type MoistureLabel = 17 | 18 | 19 | 20;

export type MoistureLabelValue = MoistureLabel | null;

/** §4.1 — configured deduction rate per label (lb per 50 lb of actual weight). */
export type MoistureRates = Record<MoistureLabel, number>;

/** §4.1 — deduction basis: the rate applies once per 50 lb of actual weight. */
export const MOISTURE_BASIS_LB = 50;

/** §4.1 — all human-selectable moisture labels, in ascending display order. */
export const MOISTURE_LABEL_OPTIONS: readonly MoistureLabel[] = [17, 18, 19, 20];

/**
 * §4.1 — DEFAULT moisture deduction rates (V2 Settings default; must ship
 * exactly): 17→1, 18→2, 19→3, 20→4 lb per 50 lb.
 */
export const DEFAULT_MOISTURE_RATES: MoistureRates = {
  17: 1,
  18: 2,
  19: 3,
  20: 4,
};

/** Type guard: exactly the labels 17|18|19|20. */
export function isMoistureLabel(value: number): value is MoistureLabel {
  return value === 17 || value === 18 || value === 19 || value === 20;
}

/**
 * §4.1 — `null` is valid ("None"); 17/18/19/20 are valid; anything else
 * (e.g. 16, 21, 0) is invalid.
 */
export function isValidMoistureLabel(label: number | null | undefined): boolean {
  if (label == null) return true; // None
  return isMoistureLabel(label);
}

/**
 * §4.1 — merge user-configured (Settings) values over the defaults, falling
 * back to the default for any label whose configured value is not a finite
 * number ≥ 0. The result is a complete rate table for the moisture functions.
 */
export function resolveMoistureRates(
  configured: Partial<MoistureRates> | null | undefined,
): MoistureRates {
  const result: MoistureRates = { ...DEFAULT_MOISTURE_RATES };
  for (const label of MOISTURE_LABEL_OPTIONS) {
    const candidate = configured?.[label];
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
      result[label] = candidate;
    }
  }
  return result;
}

/**
 * §4.1 — deduction rate for a label: 0 for None/unknown labels, otherwise the
 * configured (or default) value for that label.
 */
export function moistureRateForLabel(
  label: number | null | undefined,
  rates: Readonly<MoistureRates> = DEFAULT_MOISTURE_RATES,
): number {
  if (label == null) return 0;
  return isMoistureLabel(label) ? rates[label] : 0;
}

/**
 * §4.2 — moisture loss for a weight: `W / 50 × rate`. Returns 0 when the
 * weight is not a finite positive number or the label is None/unknown.
 */
export function moistureLossForWeight(
  weightLb: number,
  label: number | null | undefined,
  rates: Readonly<MoistureRates> = DEFAULT_MOISTURE_RATES,
): number {
  if (!Number.isFinite(weightLb) || weightLb <= 0 || label == null) return 0;
  if (!isMoistureLabel(label)) return 0;
  return (weightLb / MOISTURE_BASIS_LB) * moistureRateForLabel(label, rates);
}

/**
 * §4.6 — moisture-adjusted display weight: `W − (W/50 × rate)`. Sum of
 * adjusted rows equals the purchase net pound exactly when one label applies
 * to every row (Pattern 1). No moisture ⇒ adjusted equals the original weight.
 */
export function moistureAdjustedWeight(
  weightLb: number,
  label: number | null | undefined,
  rates: Readonly<MoistureRates> = DEFAULT_MOISTURE_RATES,
): number {
  if (!Number.isFinite(weightLb) || weightLb <= 0) return 0;
  return weightLb - moistureLossForWeight(weightLb, label, rates);
}

/** §4.3 — one bag row as used by the moisture aggregations. */
export interface MoistureRowInput {
  weight_lb: number;
  moisture_label: MoistureLabelValue;
}

/** §4.3 — purchase-level moisture aggregation result. */
export interface MoistureTotals {
  /** Sum of actual bag/row weights (gross pound). */
  gross_pound: number;
  /** Total moisture deduction (lb), from gross pounds — never bag count. */
  moisture_loss: number;
  /** Gross pound − moisture loss. */
  net_pound: number;
}

/**
 * §4.3 — aggregate rows into gross / moisture-loss / net. Loss is always
 * calculated from the actual total pound weight; bag count is never part of
 * the formula.
 */
export function computeMoistureTotals(
  rows: readonly MoistureRowInput[],
  rates: Readonly<MoistureRates> = DEFAULT_MOISTURE_RATES,
): MoistureTotals {
  let gross_pound = 0;
  let moisture_loss = 0;
  for (const row of rows) {
    gross_pound += row.weight_lb;
    moisture_loss += moistureLossForWeight(row.weight_lb, row.moisture_label, rates);
  }
  return {
    gross_pound,
    moisture_loss,
    net_pound: gross_pound - moisture_loss,
  };
}

/**
 * §8 — Pattern 2 "Moisture Breakdown": counts rows per moisture label
 * (ascending order), as `label:count` pairs joined by ", " — no "lb" unit,
 * ignoring None/default rows. Returns '' when no labeled rows exist.
 */
export function formatMoistureLabelCount(rows: readonly MoistureRowInput[]): string {
  const counts = new Map<MoistureLabel, number>();
  for (const row of rows) {
    const label = row.moisture_label;
    if (label != null) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return '';
  return MOISTURE_LABEL_OPTIONS.filter((label) => counts.has(label))
    .map((label) => `${label}:${counts.get(label)!}`)
    .join(', ');
}
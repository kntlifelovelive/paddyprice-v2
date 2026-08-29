/**
 * Purchase numbers — docs/DOMAIN_RULES.md §6.1.
 *
 * Format `PSO-YYYYMM-NNNN`: `YYYYMM` is the purchase-date year+month and
 * `NNNN` is a zero-padded 4-digit sequence that resets to `0001` each calendar
 * month. These pure functions derive the next number from a date and the set
 * of already-created numbers — the caller (a DAO in a later step) supplies the
 * CURRENT set belonging to that month. Persistence is not implemented here.
 */

/** §6.1 — `YYYY-MM-DD` → `PSO-YYYYMM`. */
export function purchaseNumberPrefix(date: string): string {
  return `PSO-${date.slice(0, 4)}${date.slice(5, 7)}`;
}

/** §6.1 — zero-padded 4-digit sequence, e.g. 7 → "0007". */
export function formatPurchaseSequence(seq: number): string {
  return String(seq).padStart(4, '0');
}

/**
 * §6.1 — next sequence number for the given date, based on the highest
 * existing suffix among the already-created numbers for that month
 * (or `0001` when none exist). Numbers from other months are ignored.
 */
export function nextPurchaseSequence(
  existingNumbers: readonly string[],
  date: string,
): number {
  const prefix = purchaseNumberPrefix(date);
  let max = 0;
  for (const purchaseNo of existingNumbers) {
    if (!purchaseNo.startsWith(`${prefix}-`)) continue;
    const suffix = Number(purchaseNo.slice(prefix.length + 1));
    if (Number.isFinite(suffix) && suffix > max) max = suffix;
  }
  return max + 1;
}

/** §6.1 — generate the next full purchase number `PSO-YYYYMM-NNNN`. */
export function generateNextPurchaseNo(
  date: string,
  existingNumbers: readonly string[],
): string {
  const prefix = purchaseNumberPrefix(date);
  return `${prefix}-${formatPurchaseSequence(nextPurchaseSequence(existingNumbers, date))}`;
}
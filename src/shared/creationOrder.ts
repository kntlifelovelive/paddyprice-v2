/**
 * Creation-order numbering for newest-first tables (Customer, Paddy Type,
 * Price — same concept as the Moisture page's per-group No).
 *
 * No. is the record's PERMANENT creation rank:
 *   - No. 1 always belongs to the FIRST created record
 *   - the newest record receives the HIGHEST No.
 * while the table itself displays newest first (DAO `created_at DESC`).
 *
 * The rank is derived from the already-persisted `created_at` field (ties
 * broken by `id`, the insertion identifier — same convention the Moisture
 * page uses). No duplicate numbering state is stored anywhere.
 */
export function creationOrderNos<T extends { id: number; created_at: string }>(
  items: readonly T[],
): Map<number, number> {
  const nos = new Map<number, number>()
  ;[...items]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    .forEach((item, i) => {
      nos.set(item.id, i + 1)
    })
  return nos
}

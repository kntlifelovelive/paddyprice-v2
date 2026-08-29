/**
 * Purchase finalize precondition — docs/DOMAIN_RULES.md §7.
 *
 * Pure rule only: finalize requires at least one bag. (The orchestration —
 * generate the voucher PDF first, then mark `finalized` and stamp `pdf_path`,
 * leaving the purchase saved-but-unfinalized on PDF failure — is implemented
 * in a later services step.)
 */
export function canFinalizePurchase(bagCount: number): boolean {
  return bagCount > 0;
}
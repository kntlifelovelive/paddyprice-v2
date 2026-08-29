/**
 * Purchase service — docs/ARCHITECTURE.md §3.5 (`services/purchase`).
 *
 * Orchestrates the purchase-session use cases: creation (exact `date +
 * rice_type_id` price lookup with NO fallback; price snapshot + purchase
 * number assembled via `domain/purchase`; insert via DAO), weight entry/edit/
 * undo/remove (validate via `domain`, mutate via DAO, recompute totals via
 * `domain`), and finalize (preconditions → PDF-path stamp).
 *
 * Business calculations stay in `src/domain` — this service never re-derives a
 * rule. Moisture deduction rates ALWAYS come from the purchase's SNAPSHOT
 * (`snapshot.moisture_rates`), never from current Settings, so later Settings
 * changes can never alter an existing purchase (DOMAIN_RULES §4.4). The tin
 * formula is NOT snapshotted (documented), so total recomputation uses the
 * current effective lb-per-tin.
 */
import type { Database } from 'sql.js'
import type { NewPurchaseInput, PurchaseRecord } from '@/types'
import type { MoistureLabelValue } from '@/domain/paddy/moisture'
import { isValidMoistureLabel } from '@/domain/paddy/moisture'
import type { PurchaseTotals } from '@/domain/purchase/totals'
import { computePurchaseTotals } from '@/domain/purchase/totals'
import type { PurchaseSnapshot } from '@/domain/purchase/types'
import { canFinalizePurchase } from '@/domain/purchase/finalize'
import { generateNextPurchaseNo } from '@/domain/purchase/numbers'
import { validateWeight } from '@/domain/paddy/weights'
import { getFarmer } from '@/infrastructure/db/dao/farmers'
import { getRiceType } from '@/infrastructure/db/dao/riceTypes'
import { getPriceForDateAndType } from '@/infrastructure/db/dao/ricePrices'
import {
  addBagRow,
  createPurchase as insertPurchase,
  deleteBagRow,
  getBagRow,
  getPurchase,
  lastBagSeq,
  listPurchaseNumbers,
  listPurchases,
  setPurchaseFinalized,
  updateBagRow,
  updatePurchaseTotals,
  type PurchaseFilter,
} from '@/infrastructure/db/dao/purchases'
import { settingsService } from '@/services/settings'

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type PurchaseServiceErrorCode =
  | 'price_not_found'
  | 'farmer_not_found'
  | 'purchase_not_found'
  | 'invalid_weight'
  | 'invalid_moisture_label'
  | 'bag_not_found'
  | 'no_bags'
  | 'pdf_path_required'
  | 'finalized'

export class PurchaseServiceError extends Error {
  readonly code: PurchaseServiceErrorCode

  constructor(code: PurchaseServiceErrorCode, message: string) {
    super(message)
    this.name = 'PurchaseServiceError'
    this.code = code
  }
}

export function isPurchaseServiceError(err: unknown): err is PurchaseServiceError {
  return err instanceof PurchaseServiceError
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function requirePurchase(db: Database, id: number): PurchaseRecord {
  const record = getPurchase(db, id)
  if (!record) {
    throw new PurchaseServiceError('purchase_not_found', `Purchase ${id} not found`)
  }
  return record
}

/** §7 — finalized purchases are read-only; no mutation may touch them. */
function assertNotFinalized(snapshot: PurchaseSnapshot): void {
  if (snapshot.finalized) {
    throw new PurchaseServiceError(
      'finalized',
      `Purchase ${snapshot.purchase_no} is finalized and read-only`,
    )
  }
}

/** Recompute and persist totals from the stored rows using SNAPSHOT rates. */
function recomputeTotals(db: Database, purchaseId: number): PurchaseTotals {
  const record = requirePurchase(db, purchaseId)
  const s = record.snapshot
  // §4.4 — deduction rates are the purchase's SNAPSHOT, never current Settings.
  const totals = computePurchaseTotals({
    rows: record.bags,
    price_per_tin: s.price_per_tin,
    lb_per_tin: settingsService.lbPerTin(db),
    rates: s.moisture_rates,
  })
  updatePurchaseTotals(db, purchaseId, totals)
  return totals
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

/** §5.4 — the price is looked up by the service, never trusted from a caller. */
export type CreatePurchaseInput = Omit<NewPurchaseInput, 'price_100_tin' | 'price_per_tin'>

/**
 * Create a purchase session. Lookup is exact `date + rice_type_id` with NO
 * fallback. The purchase is created with zero bags / zero totals (§6.2) and
 * the CURRENT configured moisture rates snapshotted into it (§4.4). The price
 * snapshot is taken from the looked-up price row (§5.4).
 */
export function createPurchase(db: Database, input: CreatePurchaseInput): PurchaseRecord {
  if (!isValidMoistureLabel(input.moisture_label)) {
    throw new PurchaseServiceError('invalid_moisture_label', 'Invalid moisture label')
  }

  const farmer = getFarmer(db, input.farmer_id)
  if (!farmer) {
    throw new PurchaseServiceError('farmer_not_found', `Farmer ${input.farmer_id} not found`)
  }

  const price = getPriceForDateAndType(db, input.date, input.rice_type_id)
  if (!price) {
    throw new PurchaseServiceError(
      'price_not_found',
      `No price recorded for ${input.date} + rice type ${input.rice_type_id}`,
    )
  }

  const purchase_no = generateNextPurchaseNo(input.date, listPurchaseNumbers(db))
  const rates = settingsService.moistureRates(db) // §4.4 — snapshotted at creation
  const rice = getRiceType(db, input.rice_type_id)

  const snapshot: PurchaseSnapshot = {
    id: 0,
    purchase_no,
    date: input.date,
    farmer_id: input.farmer_id,
    farmer_name: farmer.name,
    rice_type_id: input.rice_type_id,
    rice_type_name: rice?.name ?? '',
    price_100_tin: price.price_100_tin,
    price_per_tin: price.price_per_tin,
    total_bags: 0,
    total_pounds: 0,
    total_tins: 0,
    total_amount: 0,
    gross_pound: 0,
    moisture_loss: 0,
    net_pound: 0,
    moisture_label: input.moisture_label ?? null,
    moisture_rates: rates,
    finalized: false,
    pdf_path: null,
  }

  const id = insertPurchase(db, { snapshot, bags: [] })
  return { snapshot: { ...snapshot, id }, bags: [] }
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** Fetch one purchase (snapshot + bags) or null. */
export function getPurchaseRecord(db: Database, id: number): PurchaseRecord | null {
  return getPurchase(db, id)
}

/** List purchases, newest first (date DESC, id DESC). */
export function listPurchaseRecords(
  db: Database,
  filter: PurchaseFilter = {},
): PurchaseRecord[] {
  return listPurchases(db, filter)
}
/* ------------------------------------------------------------------ */
/* Weight entry / editing                                              */
/* ------------------------------------------------------------------ */

/** §2.2 — validate and append a bag row; totals are recomputed. */
export function addWeight(
  db: Database,
  purchaseId: number,
  rawWeight: string,
  moistureLabel: MoistureLabelValue,
): { seq: number; totals: PurchaseTotals } {
  const record = requirePurchase(db, purchaseId)
  assertNotFinalized(record.snapshot)
  if (!isValidMoistureLabel(moistureLabel)) {
    throw new PurchaseServiceError('invalid_moisture_label', 'Invalid moisture label')
  }
  const parsed = validateWeight(rawWeight)
  if (!parsed.ok) {
    throw new PurchaseServiceError('invalid_weight', `Invalid weight: ${parsed.reason}`)
  }
  const seq = addBagRow(db, purchaseId, {
    weight_lb: parsed.value,
    moisture_label: moistureLabel ?? null,
  })
  return { seq, totals: recomputeTotals(db, purchaseId) }
}

/** §2.2 — edit one bag row's weight (label unchanged). */
export function setBagWeight(
  db: Database,
  purchaseId: number,
  seq: number,
  rawWeight: string,
): PurchaseTotals {
  const record = requirePurchase(db, purchaseId)
  assertNotFinalized(record.snapshot)
  const parsed = validateWeight(rawWeight)
  if (!parsed.ok) {
    throw new PurchaseServiceError('invalid_weight', `Invalid weight: ${parsed.reason}`)
  }
  const current = getBagRow(db, purchaseId, seq)
  if (!current) {
    throw new PurchaseServiceError('bag_not_found', `Bag #${seq} not found`)
  }
  updateBagRow(db, purchaseId, seq, {
    weight_lb: parsed.value,
    moisture_label: current.moisture_label,
  })
  return recomputeTotals(db, purchaseId)
}

/** §2.2 — edit one bag row's moisture label (weight unchanged). */
export function setBagMoisture(
  db: Database,
  purchaseId: number,
  seq: number,
  moistureLabel: MoistureLabelValue,
): PurchaseTotals {
  const record = requirePurchase(db, purchaseId)
  assertNotFinalized(record.snapshot)
  if (!isValidMoistureLabel(moistureLabel)) {
    throw new PurchaseServiceError('invalid_moisture_label', 'Invalid moisture label')
  }
  const current = getBagRow(db, purchaseId, seq)
  if (!current) {
    throw new PurchaseServiceError('bag_not_found', `Bag #${seq} not found`)
  }
  updateBagRow(db, purchaseId, seq, {
    weight_lb: current.weight_lb,
    moisture_label: moistureLabel ?? null,
  })
  return recomputeTotals(db, purchaseId)
}

/** §2.2 — remove one bag row; remaining rows are re-sequenced contiguously. */
export function removeBag(db: Database, purchaseId: number, seq: number): PurchaseTotals | null {
  const record = requirePurchase(db, purchaseId)
  assertNotFinalized(record.snapshot)
  if (!deleteBagRow(db, purchaseId, seq)) return null
  return recomputeTotals(db, purchaseId)
}

/** §2.2 — undo the most recent bag entry (no-op when no bags remain). */
export function undoLast(db: Database, purchaseId: number): PurchaseTotals | null {
  const record = requirePurchase(db, purchaseId)
  assertNotFinalized(record.snapshot)
  const seq = lastBagSeq(db, purchaseId)
  if (seq == null) return null
  deleteBagRow(db, purchaseId, seq)
  return recomputeTotals(db, purchaseId)
}

/* ------------------------------------------------------------------ */
/* Finalize                                                            */
/* ------------------------------------------------------------------ */

/**
 * §7 — finalize a purchase: requires ≥ 1 bag and a generated voucher PDF path
 * (PDF-first ordering; the PDF generation service is wired in a later step).
 * After finalizing the purchase becomes read-only.
 */
export function finalizePurchase(
  db: Database,
  purchaseId: number,
  pdfPath: string,
): PurchaseRecord {
  const record = requirePurchase(db, purchaseId)
  if (record.snapshot.finalized) {
    throw new PurchaseServiceError(
      'finalized',
      `Purchase ${record.snapshot.purchase_no} is already finalized`,
    )
  }
  if (!canFinalizePurchase(record.snapshot.total_bags)) {
    throw new PurchaseServiceError('no_bags', 'A purchase needs at least one bag to finalize')
  }
  if (!pdfPath || pdfPath.trim() === '') {
    throw new PurchaseServiceError('pdf_path_required', 'A voucher PDF path is required to finalize')
  }
  recomputeTotals(db, purchaseId) // ensure the stored totals are final
  setPurchaseFinalized(db, purchaseId, true, pdfPath)
  return requirePurchase(db, purchaseId)
}
/**
 * Purchase + bag-row data access — persistence of the immutable snapshot
 * (docs/DOMAIN_RULES.md §2.4/§2.5/§4.4) and its bag rows. CRUD/mapping only:
 * every calculation (totals, tins, moisture loss, amounts) happens in
 * `src/domain` BEFORE calling these functions. `seq` (contiguous 1..n bag
 * order, §2.2) is a storage concern owned here — the domain `BagRow` stays
 * seq-free; rows are always returned in seq order.
 */
import type { Database } from 'sql.js'
import type { PurchaseRecord } from '@/types'
import type { PurchaseSnapshot } from '@/domain/purchase/types'
import type { BagRow } from '@/domain/purchase/totals'
import { transaction } from '../connection'
import { scheduleSave } from '../persistence'
import { insert, queryAll, queryOne, queryScalar, run, type Row } from './sql'

const PURCHASE_SELECT = `
  SELECT p.id, p.purchase_no, p.date, p.farmer_id, p.rice_type_id,
         p.price_100_tin, p.price_per_tin, p.total_bags, p.total_pounds,
         p.total_tins, p.total_amount, p.gross_pound, p.moisture_label,
         p.moisture_rates, p.moisture_loss, p.net_pound, p.finalized,
         p.pdf_path, p.created_at, p.updated_at,
         f.name AS farmer_name, COALESCE(r.name, '') AS rice_type_name
  FROM purchases p
  JOIN farmers f ON f.id = p.farmer_id
  LEFT JOIN rice_types r ON r.id = p.rice_type_id`

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value)
}

function mapSnapshot(row: Row): PurchaseSnapshot {
  return {
    id: Number(row.id),
    purchase_no: String(row.purchase_no),
    date: String(row.date),
    farmer_id: Number(row.farmer_id),
    farmer_name: String(row.farmer_name),
    rice_type_id: Number(row.rice_type_id),
    rice_type_name: String(row.rice_type_name),
    price_100_tin: Number(row.price_100_tin),
    price_per_tin: Number(row.price_per_tin),
    total_bags: Number(row.total_bags),
    total_pounds: Number(row.total_pounds),
    total_tins: Number(row.total_tins),
    total_amount: Number(row.total_amount),
    gross_pound: Number(row.gross_pound),
    moisture_loss: Number(row.moisture_loss),
    net_pound: Number(row.net_pound),
    moisture_label: (nullableNum(row.moisture_label) ?? null) as PurchaseSnapshot['moisture_label'],
    // §4.4 V2 — the snapshotted deduction rates stored with the purchase.
    moisture_rates: JSON.parse(String(row.moisture_rates)) as PurchaseSnapshot['moisture_rates'],
    // §7 — finalize stamp (read-only after finalize).
    finalized: Number(row.finalized) === 1,
    pdf_path: row.pdf_path == null ? null : String(row.pdf_path),
  }
}

function mapBag(row: Row): BagRow {
  return {
    weight_lb: Number(row.weight_lb),
    moisture_label: (nullableNum(row.moisture_label) ?? null) as BagRow['moisture_label'],
  }
}

/** Insert a full purchase aggregate (snapshot + bags) in one transaction. */
export function createPurchase(db: Database, record: PurchaseRecord, now: string = new Date().toISOString()): number {
  const s = record.snapshot
  const transactionResult = transaction(db, (tx) => {
    const id = insert(
      tx,
      `INSERT INTO purchases (purchase_no, farmer_id, date, rice_type_id, price_100_tin, price_per_tin,
         total_bags, total_pounds, total_tins, total_amount, gross_pound, moisture_label,
         moisture_rates, moisture_loss, net_pound, finalized, pdf_path, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.purchase_no, s.farmer_id, s.date, s.rice_type_id, s.price_100_tin, s.price_per_tin,
        s.total_bags, s.total_pounds, s.total_tins, s.total_amount, s.gross_pound,
        s.moisture_label, JSON.stringify(s.moisture_rates), s.moisture_loss, s.net_pound,
        0, null, now, now,
      ],
    )
    record.bags.forEach((bag, index) => {
      run(
        tx,
        'INSERT INTO bags (purchase_id, seq, weight_lb, moisture_label, recorded_at) VALUES (?, ?, ?, ?, ?)',
        [id, index + 1, bag.weight_lb, bag.moisture_label, now],
      )
    })
    return id
  })
  scheduleSave()
  return transactionResult
}

export function getPurchase(db: Database, id: number): PurchaseRecord | null {
  const row = queryOne(db, `${PURCHASE_SELECT} WHERE p.id = ?`, [id])
  if (!row) return null
  return { snapshot: mapSnapshot(row), bags: listBagRows(db, id) }
}

export function getPurchaseByNumber(db: Database, purchaseNo: string): PurchaseRecord | null {
  const row = queryOne(db, `${PURCHASE_SELECT} WHERE p.purchase_no = ?`, [purchaseNo])
  if (!row) return null
  return { snapshot: mapSnapshot(row), bags: listBagRows(db, Number(row.id)) }
}

export interface PurchaseFilter {
  farmer_id?: number
}

export function listPurchases(db: Database, filter: PurchaseFilter = {}): PurchaseRecord[] {
  const params: (string | number)[] = []
  let where = ''
  if (filter.farmer_id !== undefined) {
    where = ' WHERE p.farmer_id = ?'
    params.push(filter.farmer_id)
  }
  const rows = queryAll(db, `${PURCHASE_SELECT}${where} ORDER BY p.date DESC, p.id DESC`, params)
  return rows.map((row) => {
    const id = Number(row.id)
    return { snapshot: mapSnapshot(row), bags: listBagRows(db, id) }
  })
}

function listBagRows(db: Database, purchaseId: number): BagRow[] {
  return queryAll(
    db,
    'SELECT seq, weight_lb, moisture_label FROM bags WHERE purchase_id = ? ORDER BY seq',
    [purchaseId],
  ).map(mapBag)
}

export interface PurchaseTotals {
  total_bags: number
  total_pounds: number
  total_tins: number
  total_amount: number
  gross_pound: number
  moisture_loss: number
  net_pound: number
}

/** Persist recomputed totals (computed in `src/domain` beforehand). */
export function updatePurchaseTotals(
  db: Database,
  id: number,
  totals: PurchaseTotals,
  now: string = new Date().toISOString(),
): void {
  run(
    db,
    `UPDATE purchases SET total_bags = ?, total_pounds = ?, total_tins = ?, total_amount = ?,
       gross_pound = ?, moisture_loss = ?, net_pound = ?, updated_at = ?
     WHERE id = ?`,
    [
      totals.total_bags, totals.total_pounds, totals.total_tins, totals.total_amount,
      totals.gross_pound, totals.moisture_loss, totals.net_pound, now, id,
    ],
  )
}

/** Persist the finalize stamp (§7) — flag plus the generated voucher path. */
export function setPurchaseFinalized(
  db: Database,
  id: number,
  finalized: boolean,
  pdfPath: string | null,
  now: string = new Date().toISOString(),
): void {
  run(db, 'UPDATE purchases SET finalized = ?, pdf_path = ?, updated_at = ? WHERE id = ?', [
    finalized ? 1 : 0,
    pdfPath,
    now,
    id,
  ])
}

/** Append a bag row; `seq` = current max + 1 (contiguous numbering, §2.2). */
export function addBagRow(db: Database, purchaseId: number, bag: BagRow, recordedAt: string = new Date().toISOString()): number {
  const maxSeq = Number(queryScalar(db, 'SELECT COALESCE(MAX(seq), 0) FROM bags WHERE purchase_id = ?', [purchaseId]) ?? 0)
  return insert(
    db,
    'INSERT INTO bags (purchase_id, seq, weight_lb, moisture_label, recorded_at) VALUES (?, ?, ?, ?, ?)',
    [purchaseId, maxSeq + 1, bag.weight_lb, bag.moisture_label, recordedAt],
  )
}

/** Delete one bag row, then re-number the rest to contiguous 1..n (§2.2). */
export function deleteBagRow(db: Database, purchaseId: number, seq: number): boolean {
  const deleted = transaction(db, (tx) => {
    tx.run('DELETE FROM bags WHERE purchase_id = ? AND seq = ?', [purchaseId, seq])
    const removed = tx.getRowsModified() > 0
    if (removed) {
      tx.run(
        `UPDATE bags SET seq = (
           SELECT COUNT(*) FROM bags AS b
           WHERE b.purchase_id = bags.purchase_id AND b.seq <= bags.seq
         ) WHERE purchase_id = ?`,
        [purchaseId],
      )
    }
    return removed
  })
  if (deleted) scheduleSave()
  return deleted
}

/** Deletes the purchase; its bag rows go too (FK ON DELETE CASCADE). */
export function deletePurchase(db: Database, id: number): boolean {
  run(db, 'DELETE FROM purchases WHERE id = ?', [id])
  return db.getRowsModified() > 0
}

/** Read one bag row's current weight + label (edit use case), or null. */
export function getBagRow(db: Database, purchaseId: number, seq: number): BagRow | null {
  const row = queryOne(
    db,
    'SELECT weight_lb, moisture_label FROM bags WHERE purchase_id = ? AND seq = ?',
    [purchaseId, seq],
  )
  return row ? mapBag(row) : null
}

/** Update one bag row's weight + label in place; `seq` keeps its position. */
export function updateBagRow(
  db: Database,
  purchaseId: number,
  seq: number,
  bag: BagRow,
): boolean {
  run(
    db,
    'UPDATE bags SET weight_lb = ?, moisture_label = ? WHERE purchase_id = ? AND seq = ?',
    [bag.weight_lb, bag.moisture_label, purchaseId, seq],
  )
  const updated = db.getRowsModified() > 0
  if (updated) scheduleSave()
  return updated
}

/** Highest bag `seq` for a purchase — the undo target — or null when no bags. */
export function lastBagSeq(db: Database, purchaseId: number): number | null {
  const row = queryOne(db, 'SELECT MAX(seq) AS seq FROM bags WHERE purchase_id = ?', [purchaseId])
  return row && row.seq != null ? Number(row.seq) : null
}

/** All purchase numbers (creation order) — feeds §6.1 monthly sequence generation. */
export function listPurchaseNumbers(db: Database): string[] {
  return queryAll(db, 'SELECT purchase_no FROM purchases ORDER BY date DESC, id DESC').map((r) =>
    String(r.purchase_no),
  )
}

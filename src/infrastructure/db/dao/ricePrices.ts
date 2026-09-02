/**
 * Rice price data access — CRUD/mapping only. The (date, rice_type_id) UNIQUE
 * constraint enforces the one-price-per-date-and-type rule (§5.3) at the
 * database level; duplicates make INSERT fail.
 */
import type { Database } from 'sql.js'
import type { RicePrice } from '@/types'
import { insert, queryAll, queryOne, run, type Row } from './sql'
import { scheduleSave } from '../persistence'

const COLS = 'id, date, rice_type_id, price_100_tin, price_per_tin, created_at, updated_at'

function mapRicePrice(row: Row): RicePrice {
  return {
    id: Number(row.id),
    date: String(row.date),
    rice_type_id: Number(row.rice_type_id),
    price_100_tin: Number(row.price_100_tin),
    price_per_tin: Number(row.price_per_tin),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export interface RicePriceInput {
  date: string
  rice_type_id: number
  price_100_tin: number
  price_per_tin: number
}

export interface RicePricePatch {
  price_100_tin?: number
  price_per_tin?: number
}

/** Throws when a price already exists for the (date, rice_type_id) pair. */
export function createRicePrice(db: Database, input: RicePriceInput, now: string = new Date().toISOString()): RicePrice {
  const id = insert(
    db,
    `INSERT INTO rice_prices (date, rice_type_id, price_100_tin, price_per_tin, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.date, input.rice_type_id, input.price_100_tin, input.price_per_tin, now, now],
  )
  scheduleSave()
  return getRicePrice(db, id) as RicePrice
}

export function getRicePrice(db: Database, id: number): RicePrice | null {
  const row = queryOne(db, `SELECT ${COLS} FROM rice_prices WHERE id = ?`, [id])
  return row ? mapRicePrice(row) : null
}

/** The exact price for (date, rice type) — no date fallback here (§5.3). */
export function getPriceForDateAndType(db: Database, date: string, riceTypeId: number): RicePrice | null {
  const row = queryOne(
    db,
    `SELECT ${COLS} FROM rice_prices WHERE date = ? AND rice_type_id = ?`,
    [date, riceTypeId],
  )
  return row ? mapRicePrice(row) : null
}

export interface RicePriceFilter {
  rice_type_id?: number
  date?: string
}

export function listRicePrices(db: Database, filter: RicePriceFilter = {}): RicePrice[] {
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (filter.rice_type_id !== undefined) {
    conditions.push('rice_type_id = ?')
    params.push(filter.rice_type_id)
  }
  if (filter.date !== undefined) {
    conditions.push('date = ?')
    params.push(filter.date)
  }
  const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : ''
  const sql = `SELECT ${COLS} FROM rice_prices${where} ORDER BY created_at DESC`
  return queryAll(db, sql, params).map(mapRicePrice)
}

export function updateRicePrice(
  db: Database,
  id: number,
  patch: RicePricePatch,
  now: string = new Date().toISOString(),
): RicePrice | null {
  const sets: string[] = []
  const params: (string | number)[] = []
  if (patch.price_100_tin !== undefined) {
    sets.push('price_100_tin = ?')
    params.push(patch.price_100_tin)
  }
  if (patch.price_per_tin !== undefined) {
    sets.push('price_per_tin = ?')
    params.push(patch.price_per_tin)
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?')
    params.push(now, id)
    run(db, `UPDATE rice_prices SET ${sets.join(', ')} WHERE id = ?`, params)
    scheduleSave()
  }
  return getRicePrice(db, id)
}

export function deleteRicePrice(db: Database, id: number): boolean {
  run(db, 'DELETE FROM rice_prices WHERE id = ?', [id])
  const deleted = db.getRowsModified() > 0
  if (deleted) scheduleSave()
  return deleted
}

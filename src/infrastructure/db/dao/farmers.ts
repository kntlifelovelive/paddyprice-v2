/**
 * Farmer data access — CRUD/mapping only. No business rules here.
 */
import type { Database } from 'sql.js'
import type { Farmer } from '@/types'
import { insert, queryAll, queryOne, run, type Row } from './sql'
import { scheduleSave } from '../persistence'

const COLS = 'id, name, address, phone, created_at, updated_at'

function mapFarmer(row: Row): Farmer {
  return {
    id: Number(row.id),
    name: String(row.name),
    address: String(row.address),
    phone: String(row.phone),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export interface FarmerInput {
  name: string
  address?: string
  phone?: string
}

export interface FarmerPatch {
  name?: string
  address?: string
  phone?: string
}

export function createFarmer(db: Database, input: FarmerInput, now: string = new Date().toISOString()): Farmer {
  const id = insert(
    db,
    'INSERT INTO farmers (name, address, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [input.name, input.address ?? '', input.phone ?? '', now, now],
  )
  scheduleSave()
  return getFarmer(db, id) as Farmer
}

export function getFarmer(db: Database, id: number): Farmer | null {
  const row = queryOne(db, `SELECT ${COLS} FROM farmers WHERE id = ?`, [id])
  return row ? mapFarmer(row) : null
}

export function listFarmers(db: Database): Farmer[] {
  return queryAll(db, `SELECT ${COLS} FROM farmers ORDER BY created_at DESC`).map(mapFarmer)
}

export function updateFarmer(
  db: Database,
  id: number,
  patch: FarmerPatch,
  now: string = new Date().toISOString(),
): Farmer | null {
  const sets: string[] = []
  const params: (string | number)[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    params.push(patch.name)
  }
  if (patch.address !== undefined) {
    sets.push('address = ?')
    params.push(patch.address)
  }
  if (patch.phone !== undefined) {
    sets.push('phone = ?')
    params.push(patch.phone)
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?')
    params.push(now, id)
    run(db, `UPDATE farmers SET ${sets.join(', ')} WHERE id = ?`, params)
    scheduleSave()
  }
  return getFarmer(db, id)
}

/** Deletes the farmer; their purchases/bags go too (FK ON DELETE CASCADE). */
export function deleteFarmer(db: Database, id: number): boolean {
  run(db, 'DELETE FROM farmers WHERE id = ?', [id])
  const deleted = db.getRowsModified() > 0
  if (deleted) scheduleSave()
  return deleted
}

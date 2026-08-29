/**
 * Rice type data access — CRUD/mapping only.
 */
import type { Database } from 'sql.js'
import type { RiceType } from '@/types'
import { insert, queryAll, queryOne, run, type Row } from './sql'

const COLS = 'id, name, description, active, created_at'

function mapRiceType(row: Row): RiceType {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: String(row.description),
    active: Number(row.active),
    created_at: String(row.created_at),
  }
}

export interface RiceTypeInput {
  name: string
  description?: string
  active?: number
}

export interface RiceTypePatch {
  name?: string
  description?: string
  active?: number
}

/** Throws on duplicate name (UNIQUE constraint). */
export function createRiceType(db: Database, input: RiceTypeInput, now: string = new Date().toISOString()): RiceType {
  const id = insert(
    db,
    'INSERT INTO rice_types (name, description, active, created_at) VALUES (?, ?, ?, ?)',
    [input.name, input.description ?? '', input.active === undefined ? 1 : input.active, now],
  )
  return getRiceType(db, id) as RiceType
}

export function getRiceType(db: Database, id: number): RiceType | null {
  const row = queryOne(db, `SELECT ${COLS} FROM rice_types WHERE id = ?`, [id])
  return row ? mapRiceType(row) : null
}

export function listRiceTypes(db: Database, activeOnly = false): RiceType[] {
  const sql = `SELECT ${COLS} FROM rice_types${activeOnly ? ' WHERE active = 1' : ''} ORDER BY name COLLATE NOCASE`
  return queryAll(db, sql).map(mapRiceType)
}

export function updateRiceType(
  db: Database,
  id: number,
  patch: RiceTypePatch,
): RiceType | null {
  const sets: string[] = []
  const params: (string | number)[] = []
  if (patch.name !== undefined) {
    sets.push('name = ?')
    params.push(patch.name)
  }
  if (patch.description !== undefined) {
    sets.push('description = ?')
    params.push(patch.description)
  }
  if (patch.active !== undefined) {
    sets.push('active = ?')
    params.push(patch.active)
  }
  if (sets.length > 0) {
    params.push(id)
    run(db, `UPDATE rice_types SET ${sets.join(', ')} WHERE id = ?`, params)
  }
  return getRiceType(db, id)
}

export function deleteRiceType(db: Database, id: number): boolean {
  run(db, 'DELETE FROM rice_types WHERE id = ?', [id])
  return db.getRowsModified() > 0
}

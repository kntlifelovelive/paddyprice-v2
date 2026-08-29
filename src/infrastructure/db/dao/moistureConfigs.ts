/**
 * Per-farmer + per-paddy-type moisture pre-fill configuration (Moisture page)
 * — CRUD/mapping only.
 */
import type { Database } from 'sql.js'
import type { MoistureConfig } from '@/types'
import type { MoistureLabelValue } from '@/domain/paddy/moisture'
import { queryAll, queryOne, run, type Row } from './sql'

const SELECT = `
  SELECT m.id, m.farmer_id, m.rice_type_id, m.status, m.label, m.created_at, m.updated_at,
         f.name AS farmer_name, COALESCE(r.name, '') AS rice_type_name
  FROM moisture_configs m
  JOIN farmers f ON f.id = m.farmer_id
  LEFT JOIN rice_types r ON r.id = m.rice_type_id`

function mapConfig(row: Row): MoistureConfig {
  return {
    id: Number(row.id),
    farmer_id: Number(row.farmer_id),
    rice_type_id: Number(row.rice_type_id),
    status: row.status === 'active' ? 'active' : 'default',
    label: (row.label === null || row.label === undefined ? null : Number(row.label)) as MoistureLabelValue,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    farmer_name: String(row.farmer_name),
    rice_type_name: String(row.rice_type_name),
  }
}

export interface MoistureConfigInput {
  farmer_id: number
  rice_type_id: number
  status: 'default' | 'active'
  label: MoistureLabelValue
}

/** Upsert the configuration for one (farmer, rice type) pair. */
export function setMoistureConfig(db: Database, input: MoistureConfigInput, now: string = new Date().toISOString()): MoistureConfig {
  run(
    db,
    `INSERT INTO moisture_configs (farmer_id, rice_type_id, status, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(farmer_id, rice_type_id) DO UPDATE SET
       status = excluded.status, label = excluded.label, updated_at = excluded.updated_at`,
    [input.farmer_id, input.rice_type_id, input.status, input.label, now, now],
  )
  return getMoistureConfig(db, input.farmer_id, input.rice_type_id) as MoistureConfig
}

export function getMoistureConfig(db: Database, farmerId: number, riceTypeId: number): MoistureConfig | null {
  const row = queryOne(db, `${SELECT} WHERE m.farmer_id = ? AND m.rice_type_id = ?`, [farmerId, riceTypeId])
  return row ? mapConfig(row) : null
}

export function listMoistureConfigs(db: Database): MoistureConfig[] {
  return queryAll(db, `${SELECT} ORDER BY f.name COLLATE NOCASE, r.name COLLATE NOCASE`).map(mapConfig)
}

export function deleteMoistureConfig(db: Database, id: number): boolean {
  run(db, 'DELETE FROM moisture_configs WHERE id = ?', [id])
  return db.getRowsModified() > 0
}

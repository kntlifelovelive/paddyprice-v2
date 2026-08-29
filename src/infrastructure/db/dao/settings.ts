/**
 * Settings data access — key/value CRUD plus JSON (de)serialization of the
 * configured moisture deduction rates (§4.1 V2). Mapping only; no defaults
 * interpretation and no calculations.
 */
import type { Database } from 'sql.js'
import type { MoistureRates } from '@/domain/paddy/moisture'
import { queryAll, queryOne, run } from './sql'

export function getSetting(db: Database, key: string): string | null {
  const row = queryOne(db, 'SELECT value FROM settings WHERE key = ?', [key])
  return row ? String(row.value) : null
}

export function getAllSettings(db: Database): Record<string, string> {
  const rows = queryAll(db, 'SELECT key, value FROM settings ORDER BY key')
  const settings: Record<string, string> = {}
  for (const row of rows) settings[String(row.key)] = String(row.value)
  return settings
}

export function setSetting(db: Database, key: string, value: string): void {
  run(
    db,
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  )
}

export function deleteSetting(db: Database, key: string): boolean {
  run(db, 'DELETE FROM settings WHERE key = ?', [key])
  return db.getRowsModified() > 0
}

/** The configured moisture deduction rates, or null when not yet stored. */
export function getMoistureRates(db: Database): MoistureRates | null {
  const raw = getSetting(db, 'moisture_rates')
  return raw === null ? null : (JSON.parse(raw) as MoistureRates)
}

export function setMoistureRates(db: Database, rates: MoistureRates): void {
  setSetting(db, 'moisture_rates', JSON.stringify(rates))
}

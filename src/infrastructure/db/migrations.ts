/**
 * Schema migrations — docs/ARCHITECTURE.md §3.4.1.
 *
 * v1 is the initial V2 schema (single migration; no speculative future ones).
 * Future migrations are appended to `MIGRATIONS`; `runMigrations()` applies any
 * not-yet-recorded version in order, inside a transaction, and records each in
 * `schema_migrations` (documented mechanism). The schema follows
 * docs/REFERENCE_NOTES.md §4.2 with the V2 additions required by
 * docs/DOMAIN_RULES.md: Settings-configurable moisture deduction rates and the
 * per-purchase snapshot of the rates used at save time (`purchases.moisture_rates`).
 *
 * No calculation logic here — column constraints only.
 */
import type { Database } from 'sql.js'
import { DEFAULT_MOISTURE_RATES } from '@/domain/paddy/moisture'

export interface Migration {
  readonly version: number
  readonly name: string
  readonly statements: readonly string[]
}

const V1_INITIAL_SCHEMA: Migration = {
  version: 1,
  name: 'initial-schema',
  statements: [
    `CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,

    `CREATE TABLE farmers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX idx_farmers_name ON farmers (name)`,

    `CREATE TABLE rice_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    )`,

    // §5.3 — exactly one price per (date, rice type); exact date lookup, no fallback.
    `CREATE TABLE rice_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      rice_type_id INTEGER NOT NULL,
      price_100_tin REAL NOT NULL,
      price_per_tin REAL NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (date, rice_type_id)
    )`,
    `CREATE INDEX idx_rice_prices_date_type ON rice_prices (date, rice_type_id)`,

    // Immutable purchase snapshot: price (§5.4), moisture label (§4.4) and the
    // V2 snapshotted deduction rates used at save time (`moisture_rates` JSON,
    // §4.4 V2). rice_type_id deliberately has no FK: a rice type may be deleted
    // while historical purchases keep the stored id (REFERENCE_NOTES §5.2).
    // farmer_id cascades: deleting a farmer deletes their purchases (§5.2).
    `CREATE TABLE purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_no TEXT NOT NULL UNIQUE,
      farmer_id INTEGER NOT NULL REFERENCES farmers (id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      rice_type_id INTEGER NOT NULL,
      price_100_tin REAL NOT NULL,
      price_per_tin REAL NOT NULL,
      total_bags INTEGER NOT NULL DEFAULT 0,
      total_pounds REAL NOT NULL DEFAULT 0,
      total_tins REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      gross_pound REAL NOT NULL DEFAULT 0,
      moisture_label INTEGER,
      moisture_rates TEXT NOT NULL,
      moisture_loss REAL NOT NULL DEFAULT 0,
      net_pound REAL NOT NULL DEFAULT 0,
      finalized INTEGER NOT NULL DEFAULT 0,
      pdf_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX idx_purchases_farmer_date ON purchases (farmer_id, date)`,
    `CREATE INDEX idx_purchases_date ON purchases (date)`,

    // §2 — bag weight rows; seq is 1..n contiguous per purchase (§2.2).
    `CREATE TABLE bags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      weight_lb REAL NOT NULL,
      moisture_label INTEGER,
      recorded_at TEXT NOT NULL,
      UNIQUE (purchase_id, seq)
    )`,

    // Per-farmer + per-paddy-type moisture pre-fill configuration (Moisture page).
    `CREATE TABLE moisture_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      farmer_id INTEGER NOT NULL,
      rice_type_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('default', 'active')),
      label INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (farmer_id, rice_type_id)
    )`,

    // schema_migrations is created by runMigrations() before applying, so it is
    // deliberately NOT part of the V1 statement list.

    // Default settings seeded on first run (REFERENCE_NOTES §4.3), including the
    // V2 default moisture deduction rates: 17→1, 18→2, 19→3, 20→4 lb per 50 lb.
    `INSERT INTO settings (key, value) VALUES
      ('company_name', 'Paddy'),
      ('company_address', ''),
      ('company_phone', ''),
      ('company_footer_text', ''),
      ('tin_formula', '50'),
      ('theme', 'tokyo-night'),
      ('pdf_dir', 'PSO/pdf'),
      ('font_size', 'normal'),
      ('language', 'en'),
      ('moisture_rates', '${JSON.stringify(DEFAULT_MOISTURE_RATES)}')`,
  ],
}

export const MIGRATIONS: readonly Migration[] = [V1_INITIAL_SCHEMA]

export function getAppliedVersions(db: Database): number[] {
  const result = db.exec('SELECT version FROM schema_migrations ORDER BY version')
  return result[0]?.values.map((row) => Number(row[0])) ?? []
}

/** Apply every migration not yet recorded. Idempotent; returns how many ran. */
export function runMigrations(db: Database): number {
  db.run(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  )
  const applied = new Set(getAppliedVersions(db))
  let count = 0
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    db.run('BEGIN')
    try {
      for (const statement of migration.statements) db.run(statement)
      db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ])
      db.run('COMMIT')
      count += 1
    } catch (error) {
      try {
        db.run('ROLLBACK')
      } catch {
        // nothing to roll back
      }
      throw error
    }
  }
  return count
}

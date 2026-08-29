/**
 * Database initialization — docs/ARCHITECTURE.md §3.4.1.
 * Opens the sql.js database and applies pending migrations. This is the only
 * entry point application code uses to obtain a ready database; raw sql.js
 * details stay inside this layer.
 */
import type { Database } from 'sql.js'
import { openDatabase } from './connection'
import { runMigrations } from './migrations'

export interface InitDatabaseOptions {
  /** Open from raw SQLite bytes (persisted state / restore) instead of empty. */
  bytes?: Uint8Array | null
  /** sql.js WASM locator override (tests). */
  locateFile?: (file: string) => string
}

/** Open the database and run pending migrations. Idempotent. */
export async function initDatabase(options: InitDatabaseOptions = {}): Promise<Database> {
  const db = await openDatabase(options)
  runMigrations(db)
  return db
}

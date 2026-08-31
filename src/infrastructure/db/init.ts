/**
 * Database initialization — docs/ARCHITECTURE.md §3.4.1.
 * Opens the sql.js database, restores the persisted SQLite image, applies
 * pending migrations, and wires the IndexedDB persistence adapter so that
 * every subsequent write survives a page refresh.
 *
 * This is the only entry point application code uses to obtain a ready
 * database; raw sql.js details stay inside this layer.
 */
import type { Database } from 'sql.js'
import { openDatabase } from './connection'
import { runMigrations } from './migrations'
import { indexedDbAdapter } from './indexedDbAdapter'
import { scheduleSave, setPersistenceAdapter } from './persistence'

export interface InitDatabaseOptions {
  /** Open from raw SQLite bytes (persisted state / restore) instead of empty. */
  bytes?: Uint8Array | null
  /** sql.js WASM locator override (tests). */
  locateFile?: (file: string) => string
}

/**
 * Open the database, restore the persisted SQLite image if any, run pending
 * migrations, and install the IndexedDB persistence adapter so future writes
 * are durable across page refresh / app restart. Idempotent.
 */
export async function initDatabase(options: InitDatabaseOptions = {}): Promise<Database> {
  // Install the IndexedDB adapter FIRST so the first save after a migration
  // also lands in durable storage.
  if (typeof indexedDB !== 'undefined') {
    setPersistenceAdapter(indexedDbAdapter)
  }

  // If the caller (e.g. a restore operation) provides explicit bytes, use them.
  // Otherwise, attempt to load the previously persisted SQLite image.
  let bytes: Uint8Array | null | undefined = options.bytes
  if (bytes === undefined && typeof indexedDB !== 'undefined') {
    bytes = await indexedDbAdapter.load()
  }

  const db = await openDatabase({ ...options, bytes: bytes ?? null })
  runMigrations(db)

  // Persist the (possibly newly-migrated) database so first-run state and
  // migrations survive a refresh.
  scheduleSave()
  return db
}

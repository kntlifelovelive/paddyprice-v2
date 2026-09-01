/**
 * Database initialization — docs/ARCHITECTURE.md §3.4.1.
 * Opens the sql.js database, restores the persisted SQLite image, applies
 * pending migrations, and wires the platform persistence adapter so that
 * every subsequent write survives a refresh / app restart.
 *
 * Platform backends (shared `DbPersistenceAdapter` port, no business logic):
 *  - Android (native Capacitor): durable app-data file via
 *    `infrastructure/platform/db` (Capacitor Filesystem) — reference behavior.
 *  - Web / desktop: IndexedDB (`indexedDbAdapter`, unchanged).
 *
 * This is the only entry point application code uses to obtain a ready
 * database; raw sql.js details stay inside this layer.
 */
import type { Database } from 'sql.js'
import { openDatabase } from './connection'
import { runMigrations } from './migrations'
import { indexedDbAdapter } from './indexedDbAdapter'
import { scheduleSave, setPersistenceAdapter } from './persistence'
import { createDbPersistenceAdapter } from '@/infrastructure/platform/db'

export interface InitDatabaseOptions {
  /** Open from raw SQLite bytes (persisted state / restore) instead of empty. */
  bytes?: Uint8Array | null
  /** sql.js WASM locator override (tests). */
  locateFile?: (file: string) => string
}

/**
 * Open the database, restore the persisted SQLite image if any, run pending
 * migrations, and install the platform persistence adapter so future writes
 * are durable across page refresh / app restart. Idempotent.
 */
export async function initDatabase(options: InitDatabaseOptions = {}): Promise<Database> {
  // Install the platform adapter FIRST so the first save after a migration
  // also lands in durable storage.
  const nativeAdapter = createDbPersistenceAdapter()
  if (nativeAdapter) {
    setPersistenceAdapter(nativeAdapter)
  } else if (typeof indexedDB !== 'undefined') {
    setPersistenceAdapter(indexedDbAdapter)
  }

  // If the caller (e.g. a restore operation) provides explicit bytes, use them.
  // Otherwise, attempt to load the previously persisted SQLite image from the
  // selected platform backend.
  let bytes: Uint8Array | null | undefined = options.bytes
  if (bytes === undefined) {
    if (nativeAdapter) {
      bytes = await nativeAdapter.load()
    } else if (typeof indexedDB !== 'undefined') {
      bytes = await indexedDbAdapter.load()
    }
  }

  const db = await openDatabase({ ...options, bytes: bytes ?? null })
  runMigrations(db)

  // Persist the (possibly newly-migrated) database so first-run state and
  // migrations survive a refresh.
  scheduleSave()
  return db
}

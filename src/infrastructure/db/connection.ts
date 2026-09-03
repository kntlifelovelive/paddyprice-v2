/**
 * sql.js (SQLite compiled to WebAssembly) connection lifecycle.
 * docs/ARCHITECTURE.md §3.4.1 — ALL SQLite code lives inside
 * `src/infrastructure/db`; nothing here is exported to the UI directly and no
 * business logic lives here. Pure infrastructure: no React, no platform code.
 */
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
// Vite resolves this to a served/bundled asset URL in dev and production builds.
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

/** The 16-byte header every SQLite 3 database file starts with. */
const SQLITE_HEADER = 'SQLite format 3\u0000'

export interface OpenDatabaseOptions {
  /** sql.js WASM locator override (tests point this at node_modules). */
  locateFile?: (file: string) => string
  /** Open from raw SQLite bytes (restored image / persisted state) instead of an empty database. */
  bytes?: Uint8Array | null
}

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let wasmLocatorOverride: (() => string) | null = null

/** Test hook: override how the sql.js WASM binary is located. */
export function setWasmLocatorForTests(locator: (() => string) | null): void {
  wasmLocatorOverride = locator
}

function locateWasmFile(): string {
  return wasmLocatorOverride ? wasmLocatorOverride() : sqlWasmUrl
}

/** Whether raw bytes look like a SQLite 3 database (header check only). */
export function isSqliteBytes(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_HEADER.length) return false
  for (let i = 0; i < SQLITE_HEADER.length; i += 1) {
    if (bytes[i] !== SQLITE_HEADER.charCodeAt(i)) return false
  }
  return true
}

/** Open (or reuse) the SQLite database. Idempotent — safe to call repeatedly. */
export async function openDatabase(options: OpenDatabaseOptions = {}): Promise<Database> {
  if (db) return db
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: options.locateFile ?? locateWasmFile })
  }
  db = options.bytes ? new SQL.Database(options.bytes) : new SQL.Database()
  // Foreign keys are enforced on every connection.
  db.run('PRAGMA foreign_keys = ON;')
  return db
}

/** Close the current database; the next open starts fresh. */
export function closeDatabase(): void {
  db?.close()
  db = null
}

/**
 * Swap the in-memory database for one built from the given raw SQLite bytes
 * (backup restore). Caller validates the bytes first (`isSqliteBytes`).
 */
export function reopenDatabase(bytes: Uint8Array): Database {
  closeDatabase()
  if (!SQL) throw new Error('sql.js is not initialized — call openDatabase() first')
  db = new SQL.Database(bytes)
  db.run('PRAGMA foreign_keys = ON;')
  return db
}

/** The open database. Throws when init has not completed yet. */
export function getDatabase(): Database {
  if (!db) throw new Error('Database is not initialized — await initDatabase() first')
  return db
}

export function isDatabaseOpen(): boolean {
  return db !== null
}

/** Export the whole database as raw SQLite bytes (the persistence image). */
export function exportDatabaseBytes(): Uint8Array {
  return getDatabase().export()
}

/**
 * Validate raw SQLite bytes WITHOUT touching the live database: opens a
 * throwaway connection, checks the required user-data tables exist, and
 * closes it. Used by the backup service before a restore swap so an invalid
 * image can never leave the app without a working database.
 */
export function probeDatabase(bytes: Uint8Array): { ok: true } | { ok: false; error: string } {
  if (!SQL) throw new Error('sql.js is not initialized — call openDatabase() first')
  let probe: Database | null = null
  try {
    probe = new SQL.Database(bytes)
    const tables = new Set(
      probe.exec(
        "SELECT name FROM sqlite_master WHERE type='table'",
      )[0]?.values.map((row) => String(row[0])) ?? [],
    )
    for (const required of ['settings', 'farmers', 'purchases', 'schema_migrations']) {
      if (!tables.has(required)) return { ok: false, error: `missing table: ${required}` }
    }
    const integrity = probe.exec('PRAGMA integrity_check')[0]?.values[0]?.[0]
    if (String(integrity) !== 'ok') return { ok: false, error: `integrity: ${String(integrity)}` }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    probe?.close()
  }
}

/** Run `work` inside BEGIN/COMMIT; rolls back on any error. */
export function transaction<T>(database: Database, work: (d: Database) => T): T {
  database.run('BEGIN')
  try {
    const result = work(database)
    database.run('COMMIT')
    return result
  } catch (error) {
    try {
      database.run('ROLLBACK')
    } catch {
      // transaction was already rolled back or the connection is unusable
    }
    throw error
  }
}

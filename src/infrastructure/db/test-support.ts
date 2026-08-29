/**
 * Test-only database factory. Imports `node:module` to locate the sql.js WASM
 * binary on disk under the Node test environment, so it must never be imported
 * by application code — tests import it directly.
 */
import { createRequire } from 'node:module'
import type { Database } from 'sql.js'
import { closeDatabase, openDatabase, setWasmLocatorForTests } from './connection'
import { runMigrations } from './migrations'

const require = createRequire(import.meta.url)

/** A fresh, migrated, in-memory database (Node tests only). */
export async function createTestDatabase(): Promise<Database> {
  setWasmLocatorForTests(() => require.resolve('sql.js/dist/sql-wasm.wasm'))
  closeDatabase()
  const db = await openDatabase()
  runMigrations(db)
  return db
}

/** Close the test database and clear the WASM locator override. */
export function closeTestDatabase(): void {
  closeDatabase()
  setWasmLocatorForTests(null)
}

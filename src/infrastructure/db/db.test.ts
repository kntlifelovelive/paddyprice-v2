// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import {
  exportDatabaseBytes,
  isSqliteBytes,
  reopenDatabase,
  transaction,
} from './connection'
import { flushSave, SAVE_DEBOUNCE_MS, scheduleSave, setPersistenceAdapter } from './persistence'
import { getAppliedVersions, runMigrations } from './migrations'
import { closeTestDatabase, createTestDatabase } from './test-support'
import { createFarmer, listFarmers } from './dao/farmers'
import { getMoistureRates, getSetting } from './dao/settings'
import { run } from './dao/sql'

describe('database connection + migrations (Step 4)', () => {
  afterAll(() => {
    setPersistenceAdapter(null)
    closeTestDatabase()
  })

  it('initializes and creates the initial v1 schema with seeded defaults', async () => {
    const db = await createTestDatabase()
    expect(getAppliedVersions(db)).toEqual([1])
    const tables = db
      .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]
      .values.map((row) => String(row[0]))
    for (const table of [
      'settings',
      'farmers',
      'rice_types',
      'rice_prices',
      'purchases',
      'bags',
      'moisture_configs',
      'schema_migrations',
    ]) {
      expect(tables).toContain(table)
    }
    expect(getSetting(db, 'tin_formula')).toBe('50')
    // Default configured moisture deduction rates: 17→1, 18→2, 19→3, 20→4.
    expect(getMoistureRates(db)).toEqual({ 17: 1, 18: 2, 19: 3, 20: 4 })
  })

  it('migration mechanism is idempotent and records applied versions', async () => {
    const db = await createTestDatabase()
    expect(runMigrations(db)).toBe(0)
    expect(getAppliedVersions(db)).toEqual([1])
  })

  it('exports SQLite bytes and reopens a database from them', async () => {
    const db = await createTestDatabase()
    createFarmer(db, { name: 'Ko Aung' })
    const bytes = exportDatabaseBytes()
    expect(isSqliteBytes(bytes)).toBe(true)
    const reopened = reopenDatabase(bytes)
    expect(listFarmers(reopened).map((f) => f.name)).toEqual(['Ko Aung'])
  })

  it('rolls back failed transactions', async () => {
    const db = await createTestDatabase()
    expect(() =>
      transaction(db, (d) => {
        run(d, "INSERT INTO farmers (name, address, phone, created_at, updated_at) VALUES ('Boom', '', '', 'x', 'x')")
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(listFarmers(db)).toHaveLength(0)
  })

  it('enforces foreign keys', async () => {
    const db = await createTestDatabase()
    expect(() =>
      run(
        db,
        `INSERT INTO purchases (purchase_no, farmer_id, date, rice_type_id, price_100_tin, price_per_tin,
           moisture_rates, created_at, updated_at)
         VALUES ('PSO-202608-9999', 999, '2026-08-01', 1, 1, 1, '{}', 'x', 'x')`,
      ),
    ).toThrow()
  })
})

describe('database byte persistence (persistence foundation)', () => {
  function memoryAdapter() {
    const adapter = {
      name: 'memory-test',
      saved: null as Uint8Array | null,
      saves: 0,
      load: () => Promise.resolve<Uint8Array | null>(null),
      save(data: Uint8Array) {
        adapter.saved = data
        adapter.saves += 1
        return Promise.resolve()
      },
    }
    return adapter
  }

  it('flushSave persists the database image immediately', async () => {
    const mem = memoryAdapter()
    setPersistenceAdapter(mem)
    const db = await createTestDatabase()
    run(db, "INSERT INTO settings (key, value) VALUES ('probe', '1')")
    await flushSave()
    expect(mem.saves).toBe(1)
    expect(mem.saved !== null && isSqliteBytes(mem.saved)).toBe(true)
    setPersistenceAdapter(null)
  })

  it('scheduleSave debounces persistence', async () => {
    const mem = memoryAdapter()
    setPersistenceAdapter(mem)
    const db = await createTestDatabase()
    run(db, "INSERT INTO settings (key, value) VALUES ('probe2', '2')")
    scheduleSave()
    expect(mem.saves).toBe(0)
    await new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS + 200))
    expect(mem.saves).toBeGreaterThanOrEqual(1)
    await flushSave()
    setPersistenceAdapter(null)
  })
})

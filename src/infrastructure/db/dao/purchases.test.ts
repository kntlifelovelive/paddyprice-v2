// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'
import type { MoistureRates } from '@/domain/paddy/moisture'
import type { PurchaseRecord } from '@/types'
import type { PurchaseSnapshot } from '@/domain/purchase/types'
import { closeTestDatabase, createTestDatabase } from '../test-support'
import { createFarmer } from './farmers'
import { createRiceType } from './riceTypes'
import { getMoistureRates, setMoistureRates } from './settings'
import {
  addBagRow,
  createPurchase,
  deleteBagRow,
  deletePurchase,
  getPurchase,
  getPurchaseByNumber,
  listPurchases,
  setPurchaseFinalized,
  updatePurchaseTotals,
  type PurchaseTotals,
} from './purchases'

describe('purchase DAO (persistence + snapshot isolation)', () => {
  afterAll(() => closeTestDatabase())

  const RATES: MoistureRates = { 17: 1, 18: 2, 19: 3, 20: 4 }

  function makeSnapshot(overrides: Partial<PurchaseSnapshot> = {}): PurchaseSnapshot {
    return {
      id: 0,
      purchase_no: 'PSO-202608-0001',
      date: '2026-08-01',
      farmer_id: 1,
      farmer_name: 'Ko Aung',
      rice_type_id: 1,
      rice_type_name: 'Emata',
      price_100_tin: 1_850_000,
      price_per_tin: 18_500,
      total_bags: 2,
      total_pounds: 100,
      total_tins: 2,
      total_amount: 37_000,
      gross_pound: 100,
      moisture_label: 17,
      moisture_rates: RATES,
      moisture_loss: 2,
      net_pound: 98,
      ...overrides,
    }
  }

  function makeRecord(overrides: Partial<PurchaseRecord> = {}): PurchaseRecord {
    return {
      snapshot: makeSnapshot(),
      bags: [
        { weight_lb: 50, moisture_label: 17 },
        { weight_lb: 50, moisture_label: 17 },
      ],
      ...overrides,
    }
  }

  function seed(db: Database) {
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    return { farmer, type }
  }

  it('persists a purchase with bag rows and retrieves the full snapshot', async () => {
    const db = await createTestDatabase()
    const { farmer, type } = seed(db)
    const id = createPurchase(
      db,
      makeRecord({ snapshot: makeSnapshot({ farmer_id: farmer.id, rice_type_id: type.id }) }),
    )
    expect(id).toBeGreaterThan(0)

    const loaded = getPurchase(db, id)
    expect(loaded).not.toBeNull()
    // Snapshot round-trip: price, label AND the snapshotted deduction rates.
    expect(loaded!.snapshot.moisture_rates).toEqual(RATES)
    expect(loaded!.snapshot.moisture_label).toBe(17)
    expect(loaded!.snapshot.price_100_tin).toBe(1_850_000)
    expect(loaded!.snapshot.farmer_name).toBe('Ko Aung')
    expect(loaded!.snapshot.rice_type_name).toBe('Emata')
    expect(loaded!.bags).toEqual([
      { weight_lb: 50, moisture_label: 17 },
      { weight_lb: 50, moisture_label: 17 },
    ])
    expect(listPurchases(db)).toHaveLength(1)
    expect(getPurchaseByNumber(db, 'PSO-202608-0001')?.snapshot.id).toBe(id)
  })

  it('rejects a duplicate purchase number', async () => {
    const db = await createTestDatabase()
    const { farmer, type } = seed(db)
    const base = { farmer_id: farmer.id, rice_type_id: type.id }
    createPurchase(db, makeRecord({ snapshot: makeSnapshot(base) }))
    expect(() => createPurchase(db, makeRecord({ snapshot: makeSnapshot(base) }))).toThrow()
  })

  it('persists recomputed totals via updatePurchaseTotals', async () => {
    const db = await createTestDatabase()
    const { farmer, type } = seed(db)
    const id = createPurchase(
      db,
      makeRecord({ snapshot: makeSnapshot({ farmer_id: farmer.id, rice_type_id: type.id }) }),
    )
    const totals: PurchaseTotals = {
      total_bags: 3,
      total_pounds: 150,
      total_tins: 3,
      total_amount: 55_500,
      gross_pound: 150,
      moisture_loss: 3,
      net_pound: 147,
    }
    updatePurchaseTotals(db, id, totals)
    const s = getPurchase(db, id)?.snapshot
    expect(s?.total_bags).toBe(3)
    expect(s?.total_pounds).toBe(150)
    expect(s?.total_tins).toBe(3)
    expect(s?.total_amount).toBe(55_500)
    expect(s?.net_pound).toBe(147)
  })

  it('appends and deletes bag rows with contiguous seq renumbering', async () => {
    const db = await createTestDatabase()
    const { farmer, type } = seed(db)
    const id = createPurchase(
      db,
      makeRecord({ snapshot: makeSnapshot({ farmer_id: farmer.id, rice_type_id: type.id }) }),
    )

    addBagRow(db, id, { weight_lb: 60, moisture_label: 18 })
    expect(getPurchase(db, id)?.bags).toHaveLength(3)

    expect(deleteBagRow(db, id, 1)).toBe(true)
    // Remaining rows re-number to contiguous 1..n (§2.2): 50, 60.
    expect(getPurchase(db, id)?.bags).toEqual([
      { weight_lb: 50, moisture_label: 17 },
      { weight_lb: 60, moisture_label: 18 },
    ])
    expect(deleteBagRow(db, id, 99)).toBe(false)
  })

  it('stamps the finalize flag and voucher path', async () => {
    const db = await createTestDatabase()
    const { farmer, type } = seed(db)
    const id = createPurchase(
      db,
      makeRecord({ snapshot: makeSnapshot({ farmer_id: farmer.id, rice_type_id: type.id }) }),
    )
    setPurchaseFinalized(db, id, true, 'PSO/pdf/PSO-202608-0001.pdf')
    const row = db.exec('SELECT finalized, pdf_path FROM purchases WHERE id = ?', [id])[0].values[0]
    expect(Number(row[0])).toBe(1)
    expect(String(row[1])).toBe('PSO/pdf/PSO-202608-0001.pdf')
  })

  it('deletes a purchase and cascades its bag rows', async () => {
    const db = await createTestDatabase()
    const { farmer, type } = seed(db)
    const id = createPurchase(
      db,
      makeRecord({ snapshot: makeSnapshot({ farmer_id: farmer.id, rice_type_id: type.id }) }),
    )
    expect(deletePurchase(db, id)).toBe(true)
    expect(getPurchase(db, id)).toBeNull()
    expect(listPurchases(db)).toHaveLength(0)
    expect(deletePurchase(db, id)).toBe(false)
  })

  it('changing moisture settings does NOT overwrite an already-saved purchase snapshot', async () => {
    const db = await createTestDatabase()
    const { farmer, type } = seed(db)
    const id = createPurchase(
      db,
      makeRecord({ snapshot: makeSnapshot({ farmer_id: farmer.id, rice_type_id: type.id }) }),
    )
    expect(getPurchase(db, id)?.snapshot.moisture_rates).toEqual(RATES)

    // The user later changes the configured deduction rates in Settings.
    setMoistureRates(db, { 17: 5, 18: 6, 19: 7, 20: 8 })
    expect(getMoistureRates(db)).toEqual({ 17: 5, 18: 6, 19: 7, 20: 8 })

    // The saved purchase keeps the exact snapshotted rates used at save time.
    const loaded = getPurchase(db, id)
    expect(loaded?.snapshot.moisture_rates).toEqual(RATES)
    expect(loaded?.snapshot.moisture_loss).toBe(2)
    expect(loaded?.snapshot.net_pound).toBe(98)
  })
})

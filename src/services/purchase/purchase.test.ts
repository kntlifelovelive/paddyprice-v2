// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'

import { closeTestDatabase, createTestDatabase } from '@/infrastructure/db/test-support'
import { createFarmer } from '@/infrastructure/db/dao/farmers'
import { createRiceType } from '@/infrastructure/db/dao/riceTypes'
import { createRicePrice } from '@/infrastructure/db/dao/ricePrices'
import { getPurchase } from '@/infrastructure/db/dao/purchases'
import { settingsService } from '@/services/settings'
import {
  addWeight,
  createPurchase,
  finalizePurchase,
  isPurchaseServiceError,
  PurchaseServiceError,
  removeBag,
  setBagMoisture,
  setBagWeight,
  setPurchaseMoisture,
  undoLast,
  type PurchaseServiceErrorCode,
} from './service'

interface Seed {
  db: Database
  id: number
}

async function seed(date = '2026-08-01', price100Tin = 1_850_000): Promise<Seed> {
  const db = await createTestDatabase()
  const farmer = createFarmer(db, { name: 'Ko Aung' })
  const type = createRiceType(db, { name: 'Emata' })
  createRicePrice(db, {
    date,
    rice_type_id: type.id,
    price_100_tin: price100Tin,
    price_per_tin: price100Tin / 100,
  })
  const { snapshot } = createPurchase(db, {
    farmer_id: farmer.id,
    date,
    rice_type_id: type.id,
    moisture_label: null,
  })
  return { db, id: snapshot.id }
}

function expectCode(fn: () => unknown, code: PurchaseServiceErrorCode): void {
  let err: unknown
  try {
    fn()
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(PurchaseServiceError)
  expect(isPurchaseServiceError(err)).toBe(true)
  expect((err as PurchaseServiceError).code).toBe(code)
}

describe('purchaseService (session use cases)', () => {
  afterAll(() => closeTestDatabase())

  it('requires an exact date + rice-type price (NO fallback)', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    expectCode(
      () =>
        createPurchase(db, { farmer_id: farmer.id, date: '2026-08-01', rice_type_id: type.id, moisture_label: null }),
      'price_not_found',
    )
  })

  it('creates a zero-bag purchase with the price snapshot and defaults', async () => {
    const { db, id } = await seed()
    const rec = getPurchase(db, id)!
    expect(rec.snapshot.purchase_no).toBe('PSO-202608-0001')
    expect(rec.snapshot.farmer_name).toBe('Ko Aung')
    expect(rec.snapshot.rice_type_name).toBe('Emata')
    expect(rec.snapshot.price_per_tin).toBe(18_500)
    expect(rec.snapshot.total_bags).toBe(0)
    expect(rec.snapshot.total_pounds).toBe(0)
    expect(rec.snapshot.total_tins).toBe(0)
    expect(rec.snapshot.total_amount).toBe(0)
    expect(rec.snapshot.moisture_rates).toEqual({ 17: 1, 18: 2, 19: 3, 20: 4 })
    expect(rec.snapshot.finalized).toBe(false)
    expect(rec.snapshot.pdf_path).toBeNull()
    expect(rec.bags).toEqual([])
  })
it('assigns monthly PSO-YYYYMM-NNNN numbers (reset each month)', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    createRicePrice(db, { date: '2026-08-01', rice_type_id: type.id, price_100_tin: 1_850_000, price_per_tin: 18_500 })
    createRicePrice(db, { date: '2026-08-15', rice_type_id: type.id, price_100_tin: 1_850_000, price_per_tin: 18_500 })
    createRicePrice(db, { date: '2026-09-01', rice_type_id: type.id, price_100_tin: 1_850_000, price_per_tin: 18_500 })

    const a = createPurchase(db, { farmer_id: farmer.id, date: '2026-08-01', rice_type_id: type.id, moisture_label: null })
    const b = createPurchase(db, { farmer_id: farmer.id, date: '2026-08-15', rice_type_id: type.id, moisture_label: null })
    const c = createPurchase(db, { farmer_id: farmer.id, date: '2026-09-01', rice_type_id: type.id, moisture_label: null })
    expect(a.snapshot.purchase_no).toBe('PSO-202608-0001')
    expect(b.snapshot.purchase_no).toBe('PSO-202608-0002')
    expect(c.snapshot.purchase_no).toBe('PSO-202609-0001')
  })

  it('rejects invalid weights (empty / non-numeric / negative / zero)', async () => {
    const { db, id } = await seed()
    for (const raw of ['', '   ', 'abc', '-1', '0']) {
      expectCode(() => addWeight(db, id, raw, null), 'invalid_weight')
    }
    // Duplicate weights are allowed (§2.3) — same value twice must succeed.
    addWeight(db, id, '148', null)
    addWeight(db, id, '148', null)
    expect(getPurchase(db, id)!.bags).toHaveLength(2)
  })

  it('adds a weight without moisture and recomputes totals (net = gross)', async () => {
    const { db, id } = await seed()
    const { seq, totals } = addWeight(db, id, '148', null)
    expect(seq).toBe(1)
    expect(totals.total_bags).toBe(1)
    expect(totals.total_pounds).toBe(148)
    expect(totals.gross_pound).toBe(148)
    expect(totals.moisture_loss).toBe(0)
    expect(totals.net_pound).toBe(148) // 148 Net Pound → 2 Tin + 48 Excess Lb (display)
    expect(totals.total_tins).toBeCloseTo(2.96, 10)
    expect(totals.total_amount).toBeCloseTo(54_760, 6)
  })
it('applies the moisture deduction label when adding a weight', async () => {
    const { db, id } = await seed()
    const { totals } = addWeight(db, id, '100', 17)
    expect(totals.moisture_loss).toBe(2) // 100/50 × 1
    expect(totals.net_pound).toBe(98)
    expectCode(() => addWeight(db, id, '100', 21 as never), 'invalid_moisture_label')
  })

  it('uses the SNAPSHOTTED moisture rates even after Settings change (§4.4)', async () => {
    const { db, id } = await seed()
    settingsService.updateMoistureRates(db, { 17: 10, 18: 2, 19: 3, 20: 4 })
    expect(settingsService.moistureRates(db)[17]).toBe(10)

    const { totals } = addWeight(db, id, '100', 17)
    // Snapshot rate 1, NOT the now-configured 10.
    expect(totals.moisture_loss).toBe(2)
    expect(totals.net_pound).toBe(98)

    const stored = getPurchase(db, id)!
    expect(stored.snapshot.moisture_rates[17]).toBe(1)
  })

  it('edits a bag weight (label kept) and recomputes totals', async () => {
    const { db, id } = await seed()
    addWeight(db, id, '100', 17)
    addWeight(db, id, '50', null)
    const totals = setBagWeight(db, id, 1, '200')
    expect(totals.gross_pound).toBe(250)
    expect(totals.moisture_loss).toBe(4) // 200/50 × 1
    expect(totals.net_pound).toBe(246)
    expect(getPurchase(db, id)!.bags[0]).toEqual({ weight_lb: 200, moisture_label: 17 })
    expectCode(() => setBagWeight(db, id, 1, ''), 'invalid_weight')
    expectCode(() => setBagWeight(db, id, 99, '100'), 'bag_not_found')
  })

  it('edits a bag moisture label (weight kept) and recomputes totals', async () => {
    const { db, id } = await seed()
    addWeight(db, id, '100', 17)
    addWeight(db, id, '50', null)
    const totals = setBagMoisture(db, id, 2, 18)
    expect(totals.gross_pound).toBe(150)
    expect(totals.moisture_loss).toBe(4) // 2 + (50/50 × 2)
    expect(totals.net_pound).toBe(146)
    expect(getPurchase(db, id)!.bags[1]).toEqual({ weight_lb: 50, moisture_label: 18 })
    expectCode(() => setBagMoisture(db, id, 1, 16 as never), 'invalid_moisture_label')
    expectCode(() => setBagMoisture(db, id, 99, null), 'bag_not_found')
  })

  it('removes a bag row and re-sequences the rest', async () => {
    const { db, id } = await seed()
    addWeight(db, id, '50', null)
    addWeight(db, id, '100', 17)
    addWeight(db, id, '25', null)
    const totals = removeBag(db, id, 2)!
    expect(totals.total_bags).toBe(2)
    expect(totals.total_pounds).toBe(75)
    expect(totals.net_pound).toBe(75) // the 100@17 row is gone
    expect(getPurchase(db, id)!.bags).toEqual([
      { weight_lb: 50, moisture_label: null },
      { weight_lb: 25, moisture_label: null },
    ])
    expect(removeBag(db, id, 99)).toBeNull()
  })

  it('undoLast removes only the most recent bag', async () => {
    const { db, id } = await seed()
    addWeight(db, id, '50', null)
    addWeight(db, id, '60', null)
    addWeight(db, id, '70', null)

    const t1 = undoLast(db, id)!
    expect(t1.total_bags).toBe(2)
    expect(t1.total_pounds).toBe(110)
    const t2 = undoLast(db, id)!
    expect(t2.total_pounds).toBe(50)
    const t3 = undoLast(db, id)!
    expect(t3.total_bags).toBe(0)
    expect(t3.total_pounds).toBe(0)
    expect(undoLast(db, id)).toBeNull()
  })

  it('Pattern 1: every new bag inherits the purchase-level label', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    createRicePrice(db, { date: '2026-08-01', rice_type_id: type.id, price_100_tin: 1_850_000, price_per_tin: 18_500 })
    const { snapshot } = createPurchase(db, {
      farmer_id: farmer.id,
      date: '2026-08-01',
      rice_type_id: type.id,
      moisture_label: 18,
    })
    // No explicit row label → each new row inherits the purchase label (18).
    addWeight(db, snapshot.id, '100')
    addWeight(db, snapshot.id, '95')
    addWeight(db, snapshot.id, '102')
    const rec = getPurchase(db, snapshot.id)!
    expect(rec.bags).toEqual([
      { weight_lb: 100, moisture_label: 18 },
      { weight_lb: 95, moisture_label: 18 },
      { weight_lb: 102, moisture_label: 18 },
    ])
    // loss = 297/50 × 2 = 11.88 ; net = 285.12
    expect(rec.snapshot.gross_pound).toBe(297)
    expect(rec.snapshot.moisture_loss).toBeCloseTo(11.88, 10)
    expect(rec.snapshot.net_pound).toBeCloseTo(285.12, 10)
  })

  it('Pattern 2 vs Pattern 1: a bag-level label edit changes only that row; new bags still inherit the purchase label', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    createRicePrice(db, { date: '2026-08-01', rice_type_id: type.id, price_100_tin: 1_850_000, price_per_tin: 18_500 })
    const { snapshot } = createPurchase(db, {
      farmer_id: farmer.id,
      date: '2026-08-01',
      rice_type_id: type.id,
      moisture_label: 17,
    })
    addWeight(db, snapshot.id, '100') // inherits 17
    setBagMoisture(db, snapshot.id, 1, 18) // Pattern 2: row-specific only
    addWeight(db, snapshot.id, '100') // still inherits 17
    const rec = getPurchase(db, snapshot.id)!
    expect(rec.bags).toEqual([
      { weight_lb: 100, moisture_label: 18 },
      { weight_lb: 100, moisture_label: 17 },
    ])
    // The bag-level edit must NOT become the purchase-level default.
    expect(rec.snapshot.moisture_label).toBe(17)
    // loss = 100/50 × 2 + 100/50 × 1 = 6
    expect(rec.snapshot.moisture_loss).toBeCloseTo(6, 10)
    expect(rec.snapshot.net_pound).toBeCloseTo(194, 10)
  })

  it('Pattern 1: setPurchaseMoisture affects only newly inserted rows', async () => {
    const { db, id } = await seed()
    addWeight(db, id, '100') // inherits null
    const totals = setPurchaseMoisture(db, id, 19)
    expect(totals.moisture_loss).toBe(0) // existing row keeps its own label
    addWeight(db, id, '100') // inherits 19
    const rec = getPurchase(db, id)!
    expect(rec.snapshot.moisture_label).toBe(19)
    expect(rec.bags).toEqual([
      { weight_lb: 100, moisture_label: null },
      { weight_lb: 100, moisture_label: 19 },
    ])
    // loss = 100/50 × 3 = 6
    expect(rec.snapshot.moisture_loss).toBeCloseTo(6, 10)
    expectCode(() => setPurchaseMoisture(db, id, 21 as never), 'invalid_moisture_label')
  })

  it('finalizes a purchase (≥1 bag + pdf path) then makes it read-only', async () => {
    const { db, id } = await seed()
    expectCode(() => finalizePurchase(db, id, 'PSO/pdf/voucher.pdf'), 'no_bags')
    addWeight(db, id, '50', null)
    expectCode(() => finalizePurchase(db, id, ''), 'pdf_path_required')

    const finalized = finalizePurchase(db, id, 'PSO/pdf/voucher.pdf')
    expect(finalized.snapshot.finalized).toBe(true)
    expect(finalized.snapshot.pdf_path).toBe('PSO/pdf/voucher.pdf')

    expectCode(() => addWeight(db, id, '30', null), 'finalized')
    expectCode(() => addWeight(db, id, '30'), 'finalized')
    expectCode(() => setBagWeight(db, id, 1, '30'), 'finalized')
    expectCode(() => setBagMoisture(db, id, 1, null), 'finalized')
    expectCode(() => setPurchaseMoisture(db, id, 17), 'finalized')
    expectCode(() => removeBag(db, id, 1), 'finalized')
    expectCode(() => undoLast(db, id), 'finalized')
    expectCode(() => finalizePurchase(db, id, 'PSO/pdf/d.pdf'), 'finalized')
  })
})

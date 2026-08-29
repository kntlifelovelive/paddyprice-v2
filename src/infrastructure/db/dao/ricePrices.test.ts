// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { closeTestDatabase, createTestDatabase } from '../test-support'
import { createRiceType } from './riceTypes'
import {
  createRicePrice,
  deleteRicePrice,
  getPriceForDateAndType,
  getRicePrice,
  listRicePrices,
  updateRicePrice,
} from './ricePrices'

describe('rice price DAO (CRUD + uniqueness)', () => {
  afterAll(() => closeTestDatabase())

  it('creates, reads and lists prices', async () => {
    const db = await createTestDatabase()
    const type = createRiceType(db, { name: 'Emata' })
    const price = createRicePrice(db, {
      date: '2026-08-01',
      rice_type_id: type.id,
      price_100_tin: 1_850_000,
      price_per_tin: 18_500,
    })
    expect(price.id).toBeGreaterThan(0)
    expect(getRicePrice(db, price.id)).toEqual(price)
    expect(listRicePrices(db)).toEqual([price])
  })

  it('looks up the exact price for (date, rice type)', async () => {
    const db = await createTestDatabase()
    const type = createRiceType(db, { name: 'Emata' })
    const price = createRicePrice(db, {
      date: '2026-08-01',
      rice_type_id: type.id,
      price_100_tin: 1_850_000,
      price_per_tin: 18_500,
    })
    expect(getPriceForDateAndType(db, '2026-08-01', type.id)).toEqual(price)
  })

  it('returns null when no price exists for the exact date (no fallback here)', async () => {
    const db = await createTestDatabase()
    const type = createRiceType(db, { name: 'Emata' })
    createRicePrice(db, { date: '2026-08-01', rice_type_id: type.id, price_100_tin: 1, price_per_tin: 1 })
    expect(getPriceForDateAndType(db, '2026-08-02', type.id)).toBeNull()
    expect(getPriceForDateAndType(db, '2026-08-01', type.id + 1)).toBeNull()
  })

  it('rejects duplicate (date, rice type) prices', async () => {
    const db = await createTestDatabase()
    const type = createRiceType(db, { name: 'Emata' })
    createRicePrice(db, { date: '2026-08-01', rice_type_id: type.id, price_100_tin: 1, price_per_tin: 1 })
    expect(() =>
      createRicePrice(db, { date: '2026-08-01', rice_type_id: type.id, price_100_tin: 2, price_per_tin: 2 }),
    ).toThrow()
  })

  it('updates and deletes prices', async () => {
    const db = await createTestDatabase()
    const type = createRiceType(db, { name: 'Emata' })
    const price = createRicePrice(db, { date: '2026-08-01', rice_type_id: type.id, price_100_tin: 1, price_per_tin: 1 })
    const updated = updateRicePrice(db, price.id, { price_100_tin: 2_000_000, price_per_tin: 20_000 })
    expect(updated?.price_100_tin).toBe(2_000_000)
    expect(updated?.price_per_tin).toBe(20_000)
    expect(deleteRicePrice(db, price.id)).toBe(true)
    expect(getRicePrice(db, price.id)).toBeNull()
  })

  it('filters by rice type and date', async () => {
    const db = await createTestDatabase()
    const typeA = createRiceType(db, { name: 'Emata' })
    const typeB = createRiceType(db, { name: 'Ngasein' })
    createRicePrice(db, { date: '2026-08-01', rice_type_id: typeA.id, price_100_tin: 1, price_per_tin: 1 })
    createRicePrice(db, { date: '2026-08-02', rice_type_id: typeB.id, price_100_tin: 2, price_per_tin: 2 })
    expect(listRicePrices(db, { rice_type_id: typeA.id })).toHaveLength(1)
    expect(listRicePrices(db, { date: '2026-08-02' })).toHaveLength(1)
    expect(listRicePrices(db)).toHaveLength(2)
  })
})

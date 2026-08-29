// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { closeTestDatabase, createTestDatabase } from '../test-support'
import { createFarmer, deleteFarmer, getFarmer, listFarmers, updateFarmer } from './farmers'

describe('farmer DAO (CRUD only)', () => {
  afterAll(() => closeTestDatabase())

  it('creates, reads and lists farmers', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung', address: 'Yangon', phone: '09888' })
    expect(farmer.id).toBeGreaterThan(0)
    expect(farmer.name).toBe('Ko Aung')
    expect(getFarmer(db, farmer.id)).toEqual(farmer)
    createFarmer(db, { name: 'Daw Su' })
    expect(listFarmers(db).map((f) => f.name)).toEqual(['Daw Su', 'Ko Aung'])
  })

  it('defaults optional fields to empty strings', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'U Ba' })
    expect(farmer.address).toBe('')
    expect(farmer.phone).toBe('')
  })

  it('updates only the provided fields', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung', address: 'A' })
    const updated = updateFarmer(db, farmer.id, { name: 'Ko Aung Kyaw' })
    expect(updated?.name).toBe('Ko Aung Kyaw')
    expect(updated?.address).toBe('A')
  })

  it('returns null for missing farmers', async () => {
    const db = await createTestDatabase()
    expect(getFarmer(db, 12345)).toBeNull()
    expect(updateFarmer(db, 12345, { name: 'X' })).toBeNull()
  })

  it('deletes farmers', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    expect(deleteFarmer(db, farmer.id)).toBe(true)
    expect(deleteFarmer(db, farmer.id)).toBe(false)
    expect(getFarmer(db, farmer.id)).toBeNull()
  })
})

// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { closeTestDatabase, createTestDatabase } from '../test-support'
import { createRiceType, deleteRiceType, getRiceType, listRiceTypes, updateRiceType } from './riceTypes'

describe('rice type DAO (CRUD only)', () => {
  afterAll(() => closeTestDatabase())

  it('creates, reads and lists rice types', async () => {
    const db = await createTestDatabase()
    const type = createRiceType(db, { name: 'Emata', description: 'low quality' })
    expect(type.id).toBeGreaterThan(0)
    expect(type.active).toBe(1)
    expect(getRiceType(db, type.id)).toEqual(type)
    createRiceType(db, { name: 'Ngasein' })
    expect(listRiceTypes(db)).toHaveLength(2)
  })

  it('rejects duplicate names (unique constraint)', async () => {
    const db = await createTestDatabase()
    createRiceType(db, { name: 'Emata' })
    expect(() => createRiceType(db, { name: 'Emata' })).toThrow()
  })

  it('filters active-only when asked', async () => {
    const db = await createTestDatabase()
    const a = createRiceType(db, { name: 'Emata' })
    const b = createRiceType(db, { name: 'Ngasein' })
    updateRiceType(db, b.id, { active: 0 })
    expect(listRiceTypes(db, true).map((t) => t.id)).toEqual([a.id])
    expect(listRiceTypes(db)).toHaveLength(2)
  })

  it('updates fields', async () => {
    const db = await createTestDatabase()
    const type = createRiceType(db, { name: 'Emata' })
    const updated = updateRiceType(db, type.id, { description: 'desc', active: 0 })
    expect(updated?.description).toBe('desc')
    expect(updated?.active).toBe(0)
    expect(updated?.name).toBe('Emata')
  })

  it('deletes rice types', async () => {
    const db = await createTestDatabase()
    const type = createRiceType(db, { name: 'Emata' })
    expect(deleteRiceType(db, type.id)).toBe(true)
    expect(getRiceType(db, type.id)).toBeNull()
  })
})

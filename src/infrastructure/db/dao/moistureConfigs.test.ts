// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { closeTestDatabase, createTestDatabase } from '../test-support'
import { createFarmer } from './farmers'
import { createRiceType } from './riceTypes'
import {
  deleteMoistureConfig,
  getMoistureConfig,
  listMoistureConfigs,
  setMoistureConfig,
} from './moistureConfigs'

describe('moisture configuration DAO (CRUD only)', () => {
  afterAll(() => closeTestDatabase())

  it('upserts the configuration for a (farmer, rice type) pair', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    const config = setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'active', label: 18 })
    expect(config.status).toBe('active')
    expect(config.label).toBe(18)
    expect(config.farmer_name).toBe('Ko Aung')
    expect(config.rice_type_name).toBe('Emata')
    expect(getMoistureConfig(db, farmer.id, type.id)).toEqual(config)

    const changed = setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'default', label: null })
    expect(changed.id).toBe(config.id)
    expect(changed.status).toBe('default')
    expect(changed.label).toBeNull()
  })

  it('keeps one row per (farmer, rice type) pair', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'active', label: 17 })
    setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'active', label: 19 })
    expect(listMoistureConfigs(db)).toHaveLength(1)
    expect(getMoistureConfig(db, farmer.id, type.id)?.label).toBe(19)
  })

  it('lists and deletes configurations', async () => {
    const db = await createTestDatabase()
    const farmerA = createFarmer(db, { name: 'Ko Aung' })
    const farmerB = createFarmer(db, { name: 'Daw Su' })
    const type = createRiceType(db, { name: 'Emata' })
    const a = setMoistureConfig(db, { farmer_id: farmerA.id, rice_type_id: type.id, status: 'active', label: 17 })
    setMoistureConfig(db, { farmer_id: farmerB.id, rice_type_id: type.id, status: 'default', label: null })
    expect(listMoistureConfigs(db)).toHaveLength(2)
    expect(deleteMoistureConfig(db, a.id)).toBe(true)
    expect(listMoistureConfigs(db)).toHaveLength(1)
    expect(getMoistureConfig(db, farmerA.id, type.id)).toBeNull()
  })
})

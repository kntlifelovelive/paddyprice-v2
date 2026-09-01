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
  suggestedMoistureLabel,
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

  it('suggests only ACTIVE config labels as the Pattern 1 default', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    // No config → no suggestion.
    expect(suggestedMoistureLabel(db, farmer.id, type.id)).toBeNull()
    setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'active', label: 17 })
    expect(suggestedMoistureLabel(db, farmer.id, type.id)).toBe(17)
    // Inactive (default) status → never suggested, even with a label stored.
    setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'default', label: 18 })
    expect(suggestedMoistureLabel(db, farmer.id, type.id)).toBeNull()
  })

  it('Active/Default switching keeps the row and does not destroy the saved config', async () => {
    // Regression: the Label Mark + Active/Default state machine must not
    // destroy an existing config when the status toggles Active → Default →
    // Active; the (farmer, rice type) row id stays stable and the label is
    // only ever kept for ACTIVE configs.
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Ko Aung' })
    const type = createRiceType(db, { name: 'Emata' })
    const active = setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'active', label: 18 })
    expect(active.id).toBeGreaterThan(0)

    // Switch to Default → same row (upsert), label dropped (reference rule).
    const def = setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'default', label: null })
    expect(def.id).toBe(active.id)
    expect(def.status).toBe('default')
    expect(def.label).toBeNull()
    expect(listMoistureConfigs(db)).toHaveLength(1)

    // Switch back to Active with a label → same row, label restored.
    const re = setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'active', label: 19 })
    expect(re.id).toBe(active.id)
    expect(re.status).toBe('active')
    expect(re.label).toBe(19)
    expect(listMoistureConfigs(db)).toHaveLength(1)
    expect(getMoistureConfig(db, farmer.id, type.id)?.label).toBe(19)
  })
})

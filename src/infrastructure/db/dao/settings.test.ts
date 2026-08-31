// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { closeTestDatabase, createTestDatabase } from '../test-support'
import {
  deleteSetting,
  getAllSettings,
  getMoistureRates,
  getSetting,
  setMoistureRates,
  setSetting,
} from './settings'

describe('settings DAO (CRUD + moisture rates)', () => {
  afterAll(() => closeTestDatabase())

  it('seeds the documented default settings on first run', async () => {
    const db = await createTestDatabase()
    expect(getSetting(db, 'company_name')).toBe('Paddy')
    expect(getSetting(db, 'language')).toBe('en')
    expect(getSetting(db, 'font_size')).toBe('normal')
    expect(getSetting(db, 'theme')).toBe('tokyo-night')
    expect(getSetting(db, 'pdf_dir')).toBe('PSO/pdf')
    expect(getSetting(db, 'tin_formula')).toBe('50')
    expect(getMoistureRates(db)).toEqual({ 17: 1, 18: 2, 19: 3, 20: 4 })
  })

  it('reads and writes key/value settings (upsert)', async () => {
    const db = await createTestDatabase()
    setSetting(db, 'company_name', 'My Company')
    expect(getSetting(db, 'company_name')).toBe('My Company')
    setSetting(db, 'company_name', 'Renamed')
    expect(getSetting(db, 'company_name')).toBe('Renamed')
    expect(getSetting(db, 'missing_key')).toBeNull()
  })

  it('lists all settings and deletes keys', async () => {
    const db = await createTestDatabase()
    const all = getAllSettings(db)
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(10)
    expect(all['tin_formula']).toBe('50')
    setSetting(db, 'temp_key', 'temp')
    expect(deleteSetting(db, 'temp_key')).toBe(true)
    expect(deleteSetting(db, 'temp_key')).toBe(false)
    expect(getSetting(db, 'temp_key')).toBeNull()
  })

  it('stores and retrieves configured moisture deduction rates', async () => {
    const db = await createTestDatabase()
    expect(getMoistureRates(db)).toEqual({ 17: 1, 18: 2, 19: 3, 20: 4 })
    setMoistureRates(db, { 17: 2, 18: 3, 19: 5, 20: 6 })
    expect(getMoistureRates(db)).toEqual({ 17: 2, 18: 3, 19: 5, 20: 6 })
  })
})

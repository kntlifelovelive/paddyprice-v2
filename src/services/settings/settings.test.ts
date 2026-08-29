// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'

import { closeTestDatabase, createTestDatabase } from '@/infrastructure/db/test-support'
import { getAllSettings, setSetting } from '@/infrastructure/db/dao/settings'
import { useSettingsStore } from '@/shared/state'
import { settingsService } from './service'

describe('settingsService (load/update + single-writer store sync)', () => {
  let db: Database

  beforeAll(async () => {
    db = await createTestDatabase()
  })
  afterAll(() => closeTestDatabase())
  beforeEach(() => useSettingsStore.setState({ settings: null, loaded: false }))

  it('loads the documented defaults', () => {
    const s = settingsService.load(db)
    expect(s.company_name).toBe('Paddy')
    expect(s.company_address).toBe('')
    expect(s.tin_formula).toBe('50')
    expect(s.theme).toBe('tokyo-night')
    expect(s.pdf_dir).toBe('PSO/pdf')
    expect(s.font_size).toBe('normal')
    expect(s.language).toBe('my')
    expect(s.moisture_rates).toEqual({ 17: 1, 18: 2, 19: 3, 20: 4 })
    expect(useSettingsStore.getState().loaded).toBe(true)
    expect(useSettingsStore.getState().settings).toEqual(s)
  })

  it('persists a single update and syncs the store', () => {
    settingsService.load(db)
    settingsService.update(db, 'language', 'en')
    expect(getAllSettings(db).language).toBe('en')
    expect(useSettingsStore.getState().settings?.language).toBe('en')
  })

  it('persists configured moisture rates and exposes them', () => {
    settingsService.load(db)
    const custom = { 17: 2, 18: 3, 19: 4, 20: 5 }
    settingsService.updateMoistureRates(db, custom)
    expect(settingsService.moistureRates(db)).toEqual(custom)
    expect(useSettingsStore.getState().settings?.moisture_rates).toEqual(custom)
  })

  it('serializes moisture rates through the generic update path', () => {
    settingsService.load(db)
    const custom = { 17: 0, 18: 2, 19: 3, 20: 4 }
    settingsService.update(db, 'moisture_rates', custom)
    expect(settingsService.moistureRates(db)).toEqual(custom)
  })

  it('resolves the tin formula with the domain fallback of 50', () => {
    expect(settingsService.lbPerTin(db)).toBe(50)
    setSetting(db, 'tin_formula', '45')
    expect(settingsService.lbPerTin(db)).toBe(45)
    setSetting(db, 'tin_formula', 'not-a-number')
    expect(settingsService.lbPerTin(db)).toBe(50)
    setSetting(db, 'tin_formula', '50')
  })
})
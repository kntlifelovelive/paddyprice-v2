import { beforeEach, describe, expect, it } from 'vitest'

import type { Settings } from '@/types'
import { useSettingsStore } from './useSettingsStore'

const BASE_SETTINGS: Settings = {
  company_name: 'Paddy',
  company_address: '',
  company_phone: '',
  company_footer_text: '',
  tin_formula: '50',
  moisture_rates: { 17: 1, 18: 2, 19: 3, 20: 4 },
  pdf_dir: 'PSO/pdf',
  theme: 'tokyo-night',
  font_size: 'normal',
  language: 'my',
}

describe('useSettingsStore (shared/state)', () => {
  beforeEach(() => useSettingsStore.setState({ settings: null, loaded: false }))

  it('starts unloaded with no settings', () => {
    const s = useSettingsStore.getState()
    expect(s.loaded).toBe(false)
    expect(s.settings).toBeNull()
  })

  it('load replaces the whole settings object and marks the store loaded', () => {
    useSettingsStore.getState().load(BASE_SETTINGS)
    const s = useSettingsStore.getState()
    expect(s.loaded).toBe(true)
    expect(s.settings).toEqual(BASE_SETTINGS)
  })

  it('update applies a single typed field on top of loaded settings', () => {
    useSettingsStore.getState().load(BASE_SETTINGS)
    useSettingsStore.getState().update('language', 'en')
    useSettingsStore.getState().update('moisture_rates', { 17: 2, 18: 2, 19: 3, 20: 4 })
    const s = useSettingsStore.getState().settings!
    expect(s.language).toBe('en')
    expect(s.moisture_rates).toEqual({ 17: 2, 18: 2, 19: 3, 20: 4 })
    expect(s.tin_formula).toBe('50')
  })

  it('update before load is a no-op (single-writer guard)', () => {
    useSettingsStore.getState().update('language', 'en')
    expect(useSettingsStore.getState().settings).toBeNull()
  })
})
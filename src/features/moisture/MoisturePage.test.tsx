/**
 * Moisture User Config UI persistence tests (task §PHASE 1).
 *
 * Reproduces the Android breakage end-to-end at the UI boundary:
 * edit/select → React state → setMoistureConfig upsert (persistence) →
 * re-mount (Settings leave/re-open) → restored value rendered, and a full
 * SQLite-image round trip (Android WebView reload / app restart, where the
 * app reopens FROM the persisted SQLite bytes) → values still present.
 *
 * The Save path is the existing `setMoistureConfig` DAO upsert — no new
 * configuration system; moisture calculation logic is not involved here.
 */
import { act } from 'react'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { MoisturePage } from './MoisturePage'
import { rendermount } from '@/app/rendermount'
import { createTestDatabase, closeTestDatabase } from '@/infrastructure/db/test-support'
import { openDatabase, closeDatabase, exportDatabaseBytes, getDatabase } from '@/infrastructure/db/connection'
import { runMigrations } from '@/infrastructure/db/migrations'
import { createFarmer } from '@/infrastructure/db/dao/farmers'
import { createRiceType } from '@/infrastructure/db/dao/riceTypes'
import { getMoistureConfig, listMoistureConfigs } from '@/infrastructure/db/dao/moistureConfigs'
import { useSettingsStore } from '@/shared/state'
import type { Settings } from '@/types'

function loadEnglishSettings(): void {
  const settings: Settings = {
    company_name: 'Paddy',
    company_address: '',
    company_phone: '',
    company_footer_text: '',
    tin_formula: '50',
    moisture_rates: { 17: 1, 18: 2, 19: 3, 20: 4 },
    pdf_dir: 'PSO/pdf',
    theme: 'tokyo-night',
    font_size: 'normal',
    language: 'en',
    printer_type: 'none',
    paper_width: '58',
    copies: 1,
    printer_device_address: '',
    printer_device_name: '',
  }
  useSettingsStore.getState().load(settings)
}

/**
 * Select an option from a custom Select component.
 * 1. Click the select trigger (button[role="combobox"]) to open the dropdown
 * 2. Click the desired option (li[role="option"]) in the dropdown
 */
async function choose(selectTrigger: HTMLElement, value: string): Promise<void> {
  await act(async () => {
    // Open the dropdown
    selectTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  // Find the option in the now-open dropdown
  const options = document.querySelectorAll<HTMLElement>('li[role="option"]')
  const target = [...options].find((opt) => opt.getAttribute('data-value') === value)
  expect(target).toBeDefined()
  await act(async () => {
    target!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

async function clickButton(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('Moisture User Config — edit / save / reload / persistence', () => {
  beforeEach(() => {
    loadEnglishSettings()
    // jsdom does not implement scrollIntoView (the page uses it to bring the
    // config form into view after Edit on Android portrait) — no-op it.
    Element.prototype.scrollIntoView = () => {}
  })

  afterEach(() => {
    closeTestDatabase()
  })

  it('saves a new config through the form and shows it after reopening the page', async () => {
    await createTestDatabase()
    const farmer = createFarmer(getDatabase(), { name: 'Ko Aung' })
    const type = createRiceType(getDatabase(), { name: 'Emata' })

    const r = await rendermount(<MoisturePage />)
    try {
      const selects = r.container.querySelectorAll<HTMLElement>('button[role="combobox"]')
      expect(selects.length).toBe(3)
      await choose(selects[0], String(farmer.id))
      await choose(selects[1], String(type.id))
      // Toggle Active on, then pick a label (required when Active).
      const toggle = r.container.querySelector<HTMLButtonElement>('button[role="switch"]')
      expect(toggle).not.toBeNull()
      await clickButton(toggle!)
      await choose(selects[2], '18')
      const save = [...r.container.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent === 'Save',
      )
      expect(save).toBeDefined()
      await clickButton(save!)

      // Persisted through the existing DAO upsert.
      const stored = getMoistureConfig(getDatabase(), farmer.id, type.id)
      expect(stored).not.toBeNull()
      expect(stored?.status).toBe('active')
      expect(stored?.label).toBe(18)

      // Leave Settings and come back: a FRESH mount reads the saved values.
      await r.unmount()
      const r2 = await rendermount(<MoisturePage />)
      try {
        expect(r2.html()).toContain('Ko Aung')
        expect(r2.html()).toContain('Emata')
        expect(r2.html()).toContain('18')
      } finally {
        await r2.unmount()
      }
    } finally {
      await r.unmount()
    }
  })

  it('keeps edited values after a full app restart (SQLite image round trip)', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'Daw Su' })
    const type = createRiceType(db, { name: 'Ngasein' })

    // First mount: create the config via the UI form.
    const r = await rendermount(<MoisturePage />)
    const selects = r.container.querySelectorAll<HTMLElement>('button[role="combobox"]')
    await choose(selects[0], String(farmer.id))
    await choose(selects[1], String(type.id))
    await clickButton(r.container.querySelector<HTMLButtonElement>('button[role="switch"]')!)
    await choose(selects[2], '19')
    await clickButton(
      [...r.container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save')!,
    )
    await r.unmount()

    // Simulate an Android restart: persist the SQLite image, then reopen the
    // database FROM those bytes (exactly what the Capacitor filesystem /
    // IndexedDB adapter restores on the next launch).
    const image = exportDatabaseBytes()
    closeDatabase()
    const reopened = await openDatabase({ bytes: image })
    runMigrations(reopened)

    expect(listMoistureConfigs(reopened)).toHaveLength(1)
    expect(getMoistureConfig(reopened, farmer.id, type.id)?.label).toBe(19)

    // The page renders the restored value.
    const r2 = await rendermount(<MoisturePage />)
    try {
      expect(r2.html()).toContain('Daw Su')
      expect(r2.html()).toContain('19')
    } finally {
      await r2.unmount()
    }
  })

  it('edits an existing config and the change survives a page re-open', async () => {
    const db = await createTestDatabase()
    const farmer = createFarmer(db, { name: 'U Ba' })
    const type = createRiceType(db, { name: 'Emata' })

    const r = await rendermount(<MoisturePage />)
    try {
      // Seed via the UI: Active / label 17.
      const selects = r.container.querySelectorAll<HTMLElement>('button[role="combobox"]')
      await choose(selects[0], String(farmer.id))
      await choose(selects[1], String(type.id))
      await clickButton(r.container.querySelector<HTMLButtonElement>('button[role="switch"]')!)
      await choose(selects[2], '17')
      await clickButton(
        [...r.container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save')!,
      )
      expect(getMoistureConfig(db, farmer.id, type.id)?.label).toBe(17)

      // Edit: load the row into the form, change the label, save again.
      const edit = r.container.querySelector<HTMLButtonElement>('button[aria-label="Edit moisture record"]')
      expect(edit).not.toBeNull()
      await clickButton(edit!)
      await choose(selects[2], '20')
      await clickButton(
        [...r.container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save')!,
      )

      // Same single row, updated value (upsert, not duplicate).
      expect(listMoistureConfigs(db)).toHaveLength(1)
      expect(getMoistureConfig(db, farmer.id, type.id)?.label).toBe(20)

      await r.unmount()
      const r2 = await rendermount(<MoisturePage />)
      try {
        expect(r2.html()).toContain('20')
      } finally {
        await r2.unmount()
      }
    } finally {
      await r.unmount()
    }
  })
})